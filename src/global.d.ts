declare global {
  interface Window {
    Handlebars?: any;
    CeresTemplate?: (data: any) => string; // Currently loaded template function
    CeresTemplateDataMapper?: (data: any) => any;
    CeresWidgets?: any;
  }
}

export {};
