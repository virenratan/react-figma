/* eslint-disable no-param-reassign */
import dotenv from 'dotenv'
import fetch from 'node-fetch'
import fs from 'fs'

// libs.
import figma from './lib/figma'

// attempt to load figma dev token from .env file.
dotenv.config()
let devToken = process.env.DEV_TOKEN

if (process.argv.length < 3) {
  // exit if document key and the figma dev token are both missing.
  console.log('Usage: node setup.js <file-key> [figma-dev-token]')
  process.exit(0)
} else if (process.argv.length > 3) {
  // use the fourth argument as the figma dev token.
  [, , , devToken] = process.argv
}

// set fetch headers with the token.
const headers = new fetch.Headers()
headers.append('X-Figma-Token', devToken)

// use the third argument as the file key.
const [, , fileKey] = process.argv

const baseUrl = 'https://api.figma.com'
const vectorMap = {}
const vectorList = []
const vectorTypes = ['VECTOR', 'LINE', 'REGULAR_POLYGON', 'ELLIPSE', 'STAR']

const preprocessTree = node => {
  let vectorsOnly = node.name.charAt(0) !== '#'
  let vectorVConstraint = null
  let vectorHConstraint = null

  const paintsRequireRender = paints => {
    if (!paints) return false

    let numPaints = 0
    for (const paint of paints) {
      if (paint.visible !== false) {
        numPaints += 1
      }

      if (paint.type === 'EMOJI') return true
    }

    return numPaints > 1
  }

  if (
    paintsRequireRender(node.fills) ||
    paintsRequireRender(node.strokes) ||
    (node.blendMode != null && ['PASS_THROUGH', 'NORMAL'].indexOf(node.blendMode) < 0)
  ) {
    node.type = 'VECTOR'
  }

  const children = node.children && node.children.filter(child => child.visible !== false)
  if (children) {
    for (let j = 0; j < children.length; j++) {
      if (vectorTypes.indexOf(children[j].type) < 0) vectorsOnly = false
      else {
        if (vectorVConstraint !== null && children[j].constraints.vertical !== vectorVConstraint) {
          vectorsOnly = false
        }
        if (
          vectorHConstraint !== null &&
          children[j].constraints.horizontal !== vectorHConstraint
        ) {
          vectorsOnly = false
        }
        vectorVConstraint = children[j].constraints.vertical
        vectorHConstraint = children[j].constraints.horizontal
      }
    }
  }

  node.children = children

  if (children && children.length > 0 && vectorsOnly) {
    node.type = 'VECTOR'
    node.constraints = {
      vertical: vectorVConstraint,
      horizontal: vectorHConstraint,
    }
  }

  if (vectorTypes.indexOf(node.type) >= 0) {
    node.type = 'VECTOR'
    vectorMap[node.id] = node
    vectorList.push(node.id)
    node.children = []
  }

  if (node.children) {
    for (const child of node.children) {
      preprocessTree(child)
    }
  }
}

// find a particular canvas within the document by name.
const findCanvas = canvases => {
  let theCanvas = null
  canvases.forEach(canvas => {
    if (canvas.name === 'Page 1') theCanvas = canvas
  })

  return theCanvas
}

// recursively check down the tree for nodes we are interested in.
const shakeTree = node => {
  let interestingNodes = []

  node.forEach(child => {
    if (child.name.charAt(0) === '#' && child.visible !== false) {
      preprocessTree(child)
      interestingNodes.push(child)
    } else if (child.children && child.children.length) {
      interestingNodes = [interestingNodes, ...shakeTree(child.children)]
    }
  })

  return interestingNodes.filter(filteredNode => filteredNode.name)
}

const main = async () => {
  const resp = await fetch(`${baseUrl}/v1/files/${fileKey}`, { headers })
  const data = await resp.json()
  const doc = data.document
  const canvas = findCanvas(doc.children)

  const rawComponents = canvas ? shakeTree(canvas.children) : []

  const components = []
  rawComponents.forEach(component => {
    let found = 0
    components.forEach(newItem => {
      if (newItem.name === component.name) found += 1
    })

    if (!found) components.push(component)
  })

  // const guids = vectorList.join(',')
  // const imageData = await fetch(`${baseUrl}/v1/images/${fileKey}?ids=${guids}&format=svg`, {
  //   headers,
  // })
  // const imageJSON = await imageData.json()
  //
  const images = {}
  // const images = imageJSON.images || {}
  // if (images) {
  //   let promises = []
  //   const imageGuids = []
  //   for (const guid in images) {
  //     if (images[guid] !== null) {
  //       imageGuids.push(guid)
  //       promises.push(fetch(images[guid]))
  //     }
  //   }
  //
  //   let responses = await Promise.all(promises)
  //   promises = []
  //   for (const res of responses) {
  //     promises.push(res.text())
  //   }
  //
  //   responses = await Promise.all(promises)
  //   for (let i = 0; i < responses.length; i++) {
  //     images[imageGuids[i]] = responses[i].replace('<svg ', '<svg preserveAspectRatio="none" ')
  //   }
  // }

  const componentMap = {}
  let contents = "import React, { PureComponent } from 'react';\n"
  let nextSection = ''

  components.forEach(component => {
    figma.createComponent(component, images, componentMap)
    /* eslint-disable max-len */
    nextSection += `export class Master${component.name.replace(
      /\W+/g,
      ''
    )} extends PureComponent {\n`
    nextSection += '  render() {\n'
    nextSection += `    return <div className="master" style={{backgroundColor: "${figma.colorString(component.backgroundColor)}"}}>\n`
    nextSection += `      <C${component.name.replace(/\W+/g, '')} {...this.props} nodeId="${
      component.id
    }" />\n`
    nextSection += '    </div>\n'
    nextSection += '  }\n'
    nextSection += '}\n\n'
    /* eslint-enable max-len */
  })

  const imported = {}
  Object.values(componentMap).forEach(component => {
    const { name } = component
    if (!imported[name]) {
      contents += `import { ${name} } from './components/${name}';\n`
    }
    imported[name] = true
  })
  contents += '\n'
  contents += nextSection
  nextSection = ''

  contents += 'export function getComponentFromId(id) {\n'

  Object.keys(componentMap).forEach(key => {
    const component = componentMap[key]
    contents += `  if (id === "${key}") return ${component.instance};\n`
    nextSection += `${component.doc}\n`
  })

  contents += '  return null;\n}\n\n'
  contents += nextSection

  const path = './src/figmaComponents.js'
  fs.writeFile(path, contents, err => {
    if (err) console.log(err)
    console.log(`Wrote ${path}`)
  })
}

main().catch(err => {
  console.error(err)
  console.error(err.stack)
})
