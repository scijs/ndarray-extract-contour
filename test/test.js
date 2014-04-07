"use strict"

var tape = require("tape")
var createExtractor = require("../contour.js")
var pack = require("ndarray-pack")


tape("test-vectorize", function(t) {

  var verts = []
  var cells = []
  var testVectorizer = createExtractor({
    order: [1, 0],
    vertex: function(x, y) {
      console.log("v:", x,y)
    },
    phase: function(s) {
      return s < 0
    },
    cell: function(i, j, p0, p1) {
      console.log("f:", i,j, p0, p1p1)
    }
  })

  testVectorizer(pack(
    [ [0,1,0],
      [1,1,1,],
      [0,1,0]]))
  t.end()
})