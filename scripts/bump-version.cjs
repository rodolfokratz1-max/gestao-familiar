#!/usr/bin/env node
/**
 * bump-version.js
 * Incrementa automaticamente o build e a letra da versão.
 *
 * Formato: v{major}.{build}.{letra}
 * Exemplo: v1.22.a → v1.23.b → ... → v1.48.z → v1.49.aa → v1.50.ab
 *
 * Uso:
 *   node scripts/bump-version.js          ← incrementa build + letra
 *   node scripts/bump-version.js major    ← incrementa major, reseta build e letra
 */

const fs = require('fs')
const path = require('path')

const versionFile = path.join(__dirname, '../src/version.js')

function nextLetter(letter) {
  // 'a' → 'b', 'z' → 'aa', 'az' → 'ba', 'zz' → 'aaa'
  const chars = letter.split('')
  let i = chars.length - 1
  while (i >= 0) {
    if (chars[i] < 'z') {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1)
      return chars.join('')
    }
    chars[i] = 'a'
    i--
  }
  return 'a' + chars.join('')
}

const content = fs.readFileSync(versionFile, 'utf8')
const match = content.match(/v(\d+)\.(\d+)\.([a-z]+)/)

if (!match) {
  console.error('Formato de versão não reconhecido em version.js')
  console.error('Esperado: v{major}.{build}.{letra} — ex: v1.22.a')
  process.exit(1)
}

const major  = parseInt(match[1])
const build  = parseInt(match[2])
const letter = match[3]

const isMajor = process.argv[2] === 'major'

const newMajor  = isMajor ? major + 1 : major
const newBuild  = isMajor ? 1         : build + 1
const newLetter = isMajor ? 'a'       : nextLetter(letter)

const newVersion = `v${newMajor}.${newBuild}.${newLetter}`
const newContent = `export const VERSION = '${newVersion}'\n`

fs.writeFileSync(versionFile, newContent)
console.log(`Versão atualizada: v${major}.${build}.${letter} → ${newVersion}`)
