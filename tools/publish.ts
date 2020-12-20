import * as fs from 'fs'
import { resolve } from 'path'
import * as shelljs from 'shelljs'

const tagReg = /^[0-9]+(\.[0-9]+)*(-(alpha|beta)\.[0-9]+)?/

const gitExecResult = shelljs.exec('git log -1 --pretty=%B')
const gitError = gitExecResult.stderr

if (gitError) {
  console.info(gitError)
  process.exit(1)
}

const gitStdout = gitExecResult.stdout

if (!tagReg.test(gitStdout)) {
  console.info('Not a release commit.')
  // process.exit(0)
}

const pkg = require('../package.json')
const README = fs.readFileSync(resolve(process.cwd(), 'README.md'), 'utf8')

const overWritePkg = { ...pkg, main: './dist/cjs/index.js', module: './dist/esm/index.js' }

const write = (distPath: string, data: any) => {
  return new Promise((res, reject) => {
    fs.writeFile(resolve(process.cwd(), distPath), data, 'utf8', (err) => {
      if (!err) {
        return res(void 0)
      }
      reject(err)
    })
  })
}

const pkgData = JSON.stringify(overWritePkg, null, 2)

Promise.all([write('publish/package.json', pkgData), write('publish/README.md', README)])
  .then(() => {
    // const { stderr, stdout } = shelljs.exec('npm publish publish')
    // if (stderr) {
    //   throw stderr
    // }
    // console.info(stdout)
  })
  .catch((e: Error) => {
    console.error(e)
    process.exit(1)
  })
