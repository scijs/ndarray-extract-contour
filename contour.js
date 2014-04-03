"use strict"

var pool = require("typedarray-pool")

module.exports = createSurfaceExtractor

//Helper macros
function array(i) {
  return "a" + i
}
function data(i) {
  return "d" + i
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
var VERTEX_IDS = "V"
var PHASES = "P"
var VERTEX_COUNT = "N"
var POOL_SIZE = "Q"

//Generates the surface procedure
function compileSurfaceProcedure(vertexFunc, faceFunc, phaseFunc, scalarArgs, order, typesignature) {
  var arrayArgs = typesignature.length
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
    vars.push(shape(i) + "=" + array(i) + ".shape[" + i + "]|0")
  }
  //Data, stride, offset pointers
  for(var i=0; i<arrayArgs; ++i) {
    vars.push(data(i) + "=" + array(i) + ".data",
              offset(i) + "=" + array(i) + ".offset")
    for(var j=0; j<dimension; ++j) {
      vars.push(stride(i,j) + "=" + array(i) + ".stride[" + j + "]")
    }
  }
  //Pointer and delta variables
  for(var i=0; i<arrayArgs; ++i) {
    var ptrStr = [offset(i)]
    for(var j=0; j<dimension; ++i) {
      ptrStr.push(stride(i,j))
    }
    vars.push(pointer(i) + "=" + ptrStr.join("+"))
    for(var j=1; j<1<<dimension; ++i) {
      ptrStr.length = 0
      for(var k=0; k<dimension; ++k) {
        if(j & (1<<k)) {
          ptrStr.push("-" + stride(i,j))
        }
      }
      vars.push(delta(i,j) + "=" + ptrStr.join(""))
    }
  }
  //Create step variables
  for(var i=0; i<arrayArgs; ++i) {
    for(var j=0; j<dimension; ++j) {
      var stepVal = [ stride(i,j) ]
      //TODO: Compute step variables here
      vars.push(step(i,j) + "=(" + stepVal.join("+") + ")|0")
    }
  }
  //Create index variables
  for(var i=0; i<dimension; ++i) {
    vars.push(index(i) + "=0")
  }
  //Vertex count
  vars.push(VERTEX_COUNT + "=0")
  //Compute pool size
  var sizeVariable = ["2"]
  for(var i=dimension-2; i>=0; --i) {
    sizeVariable.push(shape(order[i]))
  }
  //Previous phases and vertex_ids
  vars.push(POOL_SIZE + "=(" + sizeVariable.join("*") + ")|0",
            PHASES + "=mallocUint32(" + POOL_SIZE + ")",
            VERTEX_IDS + "=mallocUint32(" + POOL_SIZE + ")")

  //Generate outermost loop

  //Generate inner loops



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
  for(var i=0; i<arrays; ++i) {
    if(getters.indexOf(i) >= 0) {
      typesig[i] = true
    } else {
      typesig[i] = false
    }
  }
  return compileSurfaceProcedure(
    args.vertex,
    args.face,
    args.phase,
    dimension,
    scalars,
    order,
    typeSignature)
}