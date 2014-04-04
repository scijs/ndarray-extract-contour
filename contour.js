"use strict"

var pool = require("typedarray-pool")
var beautify = require("js-beautify")
var invert = require("invert-permutation")

module.exports = createSurfaceExtractor

//Helper macros
function array(i) {
  return "a" + i
}
function data(i) {
  return "d" + i
}
function cube(i,bitmask) {
  return "c" + i + "_" + bitmask
}
function shape(i) {
  return "s" + i
}
function stride(i,j) {
  return "t" + i + "_" + j
}
function offset(i) {
  return "o" + i
}
function scalar(i) {
  return "x" + i
}
function pointer(i) {
  return "p" + i
}
function delta(i,bitmask) {
  return "d" + i + "_" + bitmask
}
function index(i) {
  return "i" + i
}
function step(i,j) {
  return "u" + i + "_" + j
}
function pcube(bitmask) {
  return "b" + bitmask
}
function pdelta(bitmask) {
  return "e" + bitmask
}
function vert(i) {
  return "v" + i
}
var VERTEX_IDS = "V"
var PHASES = "P"
var VERTEX_COUNT = "N"
var POOL_SIZE = "Q"
var POINTER = "X"

//Generates the surface procedure
function compileSurfaceProcedure(vertexFunc, faceFunc, phaseFunc, scalarArgs, order, typesig) {
  var arrayArgs = typesig.length
  var dimension = order.length

  var funcName = "extractContour" + order.join("_")
  var code = []
  var vars = []
  var args = []

  //Assemble arguments
  for(var i=0; i<arrayArgs; ++i) {
    args.push(array(i))  
  }
  for(var i=0; i<scalarArgs; ++i) {
    args.push(scalar(i))
  }

  //Shape
  for(var i=0; i<dimension; ++i) {
    vars.push(shape(i) + "=" + array(0) + ".shape[" + i + "]|0")
  }
  //Data, stride, offset pointers
  for(var i=0; i<arrayArgs; ++i) {
    vars.push(data(i) + "=" + array(i) + ".data",
              offset(i) + "=" + array(i) + ".offset")
    for(var j=0; j<dimension; ++j) {
      vars.push(stride(i,j) + "=" + array(i) + ".stride[" + j + "]|0")
    }
  }
  //Pointer, delta and cube variables
  for(var i=0; i<arrayArgs; ++i) {
    vars.push(pointer(i) + "=" + offset(i))
    vars.push(cube(i,0))
    for(var j=1; j<(1<<dimension); ++j) {
      var ptrStr = []
      for(var k=0; k<dimension; ++k) {
        if(j & (1<<k)) {
          ptrStr.push("-" + stride(i,k))
        }
      }
      vars.push(delta(i,j) + "=" + ptrStr.join(""))
      vars.push(cube(i,j))
    }
  }

  //Create step variables
  for(var i=0; i<arrayArgs; ++i) {
    for(var j=0; j<dimension; ++j) {
      var stepVal = [ stride(i,order[j]) ]
      for(var k=j-1; k>=0; --k) {
        stepVal.push(stride(i, order[k]) + "*" + shape(order[k]))
      }
      vars.push(step(i,order[j]) + "=(" + stepVal.join("-") + ")|0")
    }
  }
  //Create index variables
  for(var i=0; i<dimension; ++i) {
    vars.push(index(i) + "=0")
  }
  //Vertex count
  vars.push(VERTEX_COUNT + "=0")
  //Compute pool size, initialize pool step
  var sizeVariable = ["2"]
  for(var i=dimension-2; i>=0; --i) {
    sizeVariable.push(shape(order[i]))
  }
  //Previous phases and vertex_ids
  vars.push(POOL_SIZE + "=(" + sizeVariable.join("*") + ")|0",
            PHASES + "=mallocUint32(" + POOL_SIZE + ")",
            VERTEX_IDS + "=mallocUint32(" + POOL_SIZE + ")",
            POINTER + "=0")
  //Create cube variables for phases
  vars.push(pcube(0) + "=0")
  for(var j=1; j<(1<<dimension); ++j) {
    var cubeDelta = []
    var cubeStep = [ "1" ]
    for(var k=dimension-1; k>=0; --k) {
      if(j & (1<<order[k])) {
        cubeDelta.push(cubeStep.join("*"))
      }
      cubeStep.push(shape(order[k]))
    }
    vars.push(pdelta(j) + "=-(" + cubeDelta.join("+") + ")|0",
              pcube(j) + "=0")
  }
  for(var i=0; i<(1<<dimension)-1; ++i) {
    vars.push(vert(i) + "=0")
  }

  function forLoopBegin(i, start) {
    code.push("for(", index(order[i]), "=", start, ";",
      index(order[i]), "<", shape(order[i]), ";",
      "++", index(order[i]), "){")
  }

  function forLoopEnd(i) {
    for(var j=0; j<arrayArgs; ++j) {
      code.push(pointer(j), "+=", step(j,order[i]), ";")
    }
    code.push("}")
  }

  function fillEmptySlice(k) {
    for(var i=k-1; i>=0; --i) {
      forLoopBegin(i, 0) 
    }
    var phaseFuncArgs = []
    for(var i=0; i<arrayArgs; ++i) {
      if(typesig[i]) {
        phaseFuncArgs.push(data(i) + ".get(" + pointer(i) + ")")
      } else {
        phaseFuncArgs.push(data(i) + "[" + pointer(i) + "]")
      }
    }
    for(var i=0; j<scalarArgs; ++i) {
      phaseFuncArgs.push(scalar(i))
    }
    code.push(PHASES, "[", POINTER, "++]=phase(", phaseFuncArgs.join(), ");")
    for(var i=0; i<k; ++i) {
      forLoopEnd(i)
    }
    for(var j=0; j<arrayArgs; ++j) {
      code.push(pointer(j), "+=", step(j,order[k]), ";")
    }
  }

  function processGridCell(mask) {
    //Read in local data
    for(var i=0; i<arrayArgs; ++i) {
      if(typesig[i]) {
        code.push(cube(i,0), "=", data(i), ".get(", pointer(i), ");")
      } else {
        code.push(cube(i,0), "=", data(i), "[", pointer(i), "];")
      }
    }

    //Read in phase
    var phaseFuncArgs = []
    for(var i=0; i<arrayArgs; ++i) {
      phaseFuncArgs.push(cube(i,0))
    }
    for(var i=0; j<scalarArgs; ++i) {
      phaseFuncArgs.push(scalar(i))
    }
    code.push(pcube(0), "=", PHASES, "[", POINTER, "]=phase(", phaseFuncArgs.join(), ");")
    
    //Read in other cube data
    for(var j=1; j<(1<<dimension); ++j) {
      code.push(pcube(j), "=", PHASES, "[", POINTER, "+", pdelta(j), "];")
    }

    //Check for boundary crossing
    var vertexPredicate = []
    for(var j=1; j<(1<<dimension); ++j) {
      vertexPredicate.push("(" + pcube(0) + "!==" + pcube(j) + ")")
    }
    code.push("if(", vertexPredicate.join("||"), "){")

    //Read in boundary data
    var vertexArgs = []
    for(var i=0; i<dimension; ++i) {
      vertexArgs.push(index(i))
    }
    for(var i=0; i<arrayArgs; ++i) {
      vertexArgs.push(cube(i,0))
      for(var j=1; j<(1<<dimension); ++j) {
        if(typesig[i]) {
          code.push(cube(i,j), "=", data(i), ".get(", pointer(i), "+", delta(i,j), ");")
        } else {
          code.push(cube(i,j), "=", data(i), "[", pointer(i), "+", delta(i,j), "];")
        }
        vertexArgs.push(cube(i,j))
      }
    }
    for(var i=0; i<scalarArgs; ++i) {
      vertexArgs.push(scalar(i))
    }
    for(var i=0; i<(1<<dimension); ++i) {
      vertexArgs.push(pcube(i))
    }

    //Generate vertex
    code.push("vertex(", vertexArgs.join(), ");",
      vert(0), "=", VERTEX_IDS, "[", POINTER, "]=", VERTEX_COUNT, "++;")

    //TODO: Check face crossing
    if(mask < (1<<dimension)-1) {
      for(var j=1; j<(1<<dimension); ++j) {
        if((j & mask) === 0) {
          code.push(vert(j), "=", VERTEX_IDS, "[", POINTER, "+", pcube(j), "];")
        }
      }
      var corner = pcube((1<<dimension)-1)
      for(var j=0; j<dimension; ++j) {
        if(mask & (1<<j)) {
          //Check face
          var edge = pcube(((1<<dimension)-1)^(1<<j))
          var faceArgs = []

          faceArgs.push(corner, edge)
          code.push("if(", corner, "!==", edge, "){",
            "face(", faceArgs.join(), ")}")
        }
      }

      code.push("/*" + mask + "*/")
    }

    //Increment pointer, close off if statement
    code.push("}",
      POINTER, "+=1;")
  }

  function createLoop(i, mask) {
    if(i < 0) {
      processGridCell(mask)
      return
    }
    fillEmptySlice(i)
    code.push("if(", shape(order[i]), ">0){")
    createLoop(i-1, mask|(1<<i))
    for(var j=0; j<arrayArgs; ++j) {
      code.push(pointer(j), "+=", step(j,i), ";")
    }
    forLoopBegin(i, 2)
    createLoop(i-1, mask)
    forLoopEnd(i)
    code.push("}")
  }

  createLoop(dimension-1, 0)

  //Release scratch memory
  code.push("freeUint32(", VERTEX_IDS, ");freeUint32(", PHASES, ");")

  //Compile and link procedure
  var procedureCode = [
    "'use strict';",
    "function ", funcName, "(", args.join(), "){",
      "var ", vars.join(), ";",
      code.join(""),
    "}",
    "return ", funcName ].join("")

  //Print code
  console.log(beautify(procedureCode))

  var proc = new Function(
    "vertex", 
    "face", 
    "phase", 
    "mallocUint32", 
    "freeUint32",
    procedureCode)
  return proc(
    vertexFunc, 
    faceFunc, 
    phaseFunc, 
    pool.mallocUint32, 
    pool.freeUint32)
}

function createSurfaceExtractor(args) {
  function error(msg) {
    throw new Error("ndarray-extract-contour: " + msg)
  }
  if(typeof args !== "object") {
    error("Must specify arguments")
  }
  var order = args.order
  if(!Array.isArray(order)) {
    error("Must specify order")
  }
  var arrays = args.arrayArguments||1
  if(arrays < 1) {
    error("Must have at least one array argument")
  }
  var scalars = args.scalarArguments||0
  if(scalars < 0) {
    error("Scalar arg count must be > 0")
  }
  if(typeof args.vertex !== "function") {
    error("Must specify vertex creation function")
  }
  if(typeof args.face !== "function") {
    error("Must specify face creation function")
  }
  if(typeof args.phase !== "function") {
    error("Must specify phase function")
  }
  var getters = args.getters || []
  var typesig = new Array(arrays)
  console.log(getters)
  for(var i=0; i<arrays; ++i) {
    console.log("here1")
    if(getters.indexOf(i) >= 0) {
      typesig[i] = true
    } else {
      typesig[i] = false
    }
    console.log("here2")
  }
  return compileSurfaceProcedure(
    args.vertex,
    args.face,
    args.phase,
    scalars,
    order,
    typesig)
}