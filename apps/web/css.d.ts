// TypeScript 6.0 added TS2882, which errors on side-effect imports that resolve to
// no module or type declaration. Bundler-handled stylesheets (`import "./x.css"`) have
// no declaration: Next ships none, and TypeScript 5.x silently tolerated them.
declare module "*.css"
