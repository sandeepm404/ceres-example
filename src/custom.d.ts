declare module "*.hbs" {
  const template: (data: any) => string;
  export default template;
}

declare module "*.css" {
  const css: string;
  export default css;
}

declare module "*.css?raw" {
  const text: string;
  export default text;
}
