"use strict"

var tape = require("tape")
var createExtractor = require("../contour.js")

tape("test-vectorize", function(t) {

  var testVectorizer = createExtractor({
    order: [1, 0],
    vertex: function(x, y, z) {
      console.log("got vertex:", x, y)
    },
    phase: function(s) {
      return s < 0
    },
    face: function(i, j, p0, p11) {
      console.log("face", i, j)
    }
  })

  t.end()
})