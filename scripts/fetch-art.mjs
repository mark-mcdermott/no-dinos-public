// Puts the slide art in src/assets/images/ before dev and build.
// The rules this implements are written up under "Art" in CLAUDE.md.

import { Buffer } from "node:buffer"
import { spawnSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import sharp from "sharp"

const ROOT = process.cwd()
const IMAGES = path.join(ROOT, "src", "assets", "images")
const SOURCE_MARK = path.join(IMAGES, ".source")
const FOLDERS = ["dataview", "fullscreen", "titles"]
const SIZE = { dataview: [1536, 1024], fullscreen: [1820, 1024], titles: [1820, 1024] }
const PALETTE = ["#d9d4c7", "#c9d4d9", "#d4c9d9", "#c9d9cf", "#d9ccc9"]

const env = process.env
const refresh = process.argv.includes("--refresh") || env.ART_REFRESH === "1"
const siblingRepo = path.resolve(ROOT, "..", "no-dinos-private")

const log = (message) => console.log(`art: ${message}`)
const fail = (message) => {
  console.error(`art: ${message}`)
  process.exit(1)
}

function requiredFiles() {
  const order = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "order.json"), "utf8")).order
  return order.flatMap((slug) =>
    fs.existsSync(path.join(ROOT, "data", "titles", `${slug}.jsonc`))
      ? [{ folder: "titles", slug }]
      : [
          { folder: "dataview", slug },
          { folder: "fullscreen", slug },
        ],
  )
}

const missingFiles = () =>
  requiredFiles().filter(({ folder, slug }) => !fs.existsSync(path.join(IMAGES, folder, `${slug}.png`)))

function resetImagesDir() {
  fs.rmSync(IMAGES, { recursive: true, force: true })
  fs.mkdirSync(IMAGES, { recursive: true })
}

function fetchArt(location) {
  const url = fs.existsSync(location) ? pathToFileURL(path.resolve(location)).href : location
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "no-dinos-art-"))
  try {
    // The token travels in the environment, not argv, and spawnSync never
    // echoes the command, so it cannot end up in a build log.
    const gitEnv = { ...env, GIT_TERMINAL_PROMPT: "0" }
    if (env.ART_REPO_TOKEN && url.startsWith("https://")) {
      const basic = Buffer.from(`x-access-token:${env.ART_REPO_TOKEN}`).toString("base64")
      Object.assign(gitEnv, {
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "http.extraHeader",
        GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
      })
    }

    const clone = spawnSync(
      "git",
      ["clone", "--quiet", "--depth", "1", "--branch", env.ART_REF || "main", url, tmp],
      { env: gitEnv, stdio: ["ignore", "inherit", "inherit"] },
    )
    if (clone.status !== 0) {
      fail("could not clone the art repo — check ART_REPO_URL, ART_REPO_TOKEN and ART_REF")
    }

    for (const folder of FOLDERS) {
      if (!fs.existsSync(path.join(tmp, folder))) fail(`the art repo has no ${folder}/ folder`)
    }
    const rev = spawnSync("git", ["-C", tmp, "rev-parse", "--short", "HEAD"], { encoding: "utf8" })

    resetImagesDir()
    for (const folder of FOLDERS) {
      fs.cpSync(path.join(tmp, folder), path.join(IMAGES, folder), { recursive: true })
    }
    const mark = `art:${rev.stdout.trim()}`
    fs.writeFileSync(SOURCE_MARK, `${mark}\n`)
    return mark
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

async function makePlaceholders() {
  resetImagesDir()
  const files = requiredFiles()
  for (const { folder, slug } of files) {
    const [width, height] = SIZE[folder]
    const shade = PALETTE[crypto.createHash("md5").update(slug).digest()[0] % PALETTE.length]
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="${shade}"/>
      <g font-family="sans-serif" text-anchor="middle" fill="#6b6659">
        <text x="50%" y="47%" font-size="${Math.round(height / 9)}" font-weight="700">PLACEHOLDER</text>
        <text x="50%" y="58%" font-size="${Math.round(height / 22)}">${slug}</text>
      </g>
    </svg>`
    fs.mkdirSync(path.join(IMAGES, folder), { recursive: true })
    await sharp(Buffer.from(svg)).png().toFile(path.join(IMAGES, folder, `${slug}.png`))
  }
  fs.writeFileSync(SOURCE_MARK, "placeholder\n")
  return files.length
}

async function main() {
  const wantsReal = env.ART_PLACEHOLDERS !== "1"
  const location = wantsReal
    ? env.ART_REPO_URL || (fs.existsSync(path.join(siblingRepo, "dataview")) ? siblingRepo : "")
    : ""

  const mustBeReal = env.VERCEL_ENV === "production" || env.ART_REQUIRE === "1"
  if (mustBeReal && !(env.ART_REPO_URL && wantsReal)) {
    fail("this build must have the real art but ART_REPO_URL is not set — refusing to build a deck of placeholders")
  }

  const mark = fs.existsSync(SOURCE_MARK) ? fs.readFileSync(SOURCE_MARK, "utf8").trim() : ""
  const haveReal = mark.startsWith("art:")

  if (location) {
    if (haveReal && !refresh && missingFiles().length === 0) return log(`using existing ${mark}`)
    return log(`fetched ${fetchArt(location)}`)
  }
  if (haveReal) {
    if (missingFiles().length > 0) fail("the art on disk is incomplete and no art source is configured")
    return log(`keeping existing ${mark}`)
  }
  if (mark === "placeholder" && !refresh && missingFiles().length === 0) {
    return log("placeholders already in place")
  }
  log(`generated ${await makePlaceholders()} placeholder images (no art source configured)`)
}

await main()
