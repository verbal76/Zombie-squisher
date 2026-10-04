// Hermes runtime polyfills. Side effects only.
//
// Bug #3 from glb-render-pipeline.md: three.js GLTFLoader's GLTFParser
// constructor (r166+, around line 2579) reads `navigator.userAgent`. Hermes
// has `navigator` as a truthy object but `userAgent` is undefined. The
// `typeof navigator !== 'undefined'` guard inside GLTFParser passes, then
// `userAgent.match(...)` blows up with "Cannot read property 'match' of
// undefined" on every single GLB parse.
//
// Fix: ensure navigator.userAgent is a non-empty string BEFORE any module
// imports GLTFLoader. This file must be imported as the very first line
// of App.tsx (or any other entry point) so the assignment runs before
// the GLTFLoader module is evaluated.

const g = global as any;

if (typeof g.navigator === 'undefined') {
  g.navigator = {};
}
if (typeof g.navigator.userAgent !== 'string' || g.navigator.userAgent.length === 0) {
  g.navigator.userAgent = 'react-native';
}

export {};
