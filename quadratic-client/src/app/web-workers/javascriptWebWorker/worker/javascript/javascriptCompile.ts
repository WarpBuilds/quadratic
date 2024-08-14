//! Converts the Javascript code before sending it to the worker. This includes
//! using esbuild to find syntax errors, promoting import statements to the top
//! of the file (this is to ensure they are not placed inside of the async
//! anonymous function that allows await at the top level), and adding line
//! numbers to all return statements via a caught thrown error (the only way to
//! get line numbers in JS).

import * as esbuild from 'esbuild-wasm';
import { LINE_NUMBER_VAR } from './javascript';
import { javascriptLibrary } from './runner/generateJavascriptForRunner';

export interface JavascriptTransformedCode {
  imports: string;
  code: string;
}

export async function javascriptFindSyntaxError(transformed: {
  code: string;
  imports: string;
}): Promise<{ text: string; lineNumber?: number } | false> {
  try {
    await esbuild.transform(`${transformed.imports};(async() => {;${transformed.code};\n})()`, { loader: 'js' });
    return false;
  } catch (e: any) {
    const error = e as esbuild.TransformFailure;
    if (error.errors.length) {
      const location = error.errors[0].location
        ? ` at line ${error.errors[0].location.line}:${error.errors[0].location.column} `
        : '';
      return { text: error.errors[0].text + location, lineNumber: error.errors[0].location?.line };
    }
    return { text: error.message };
  }
}

// Uses a thrown error to find the line number of the return statement.
export function javascriptAddLineNumberVars(transform: JavascriptTransformedCode): string {
  const list = transform.code.split('\n');
  let s = '';
  for (let i = 0; i < list.length; i++) {
    if (list[i].includes('return')) {
      s += `try { throw new Error() } catch (e) { const stackLines = e.stack.split("\\n"); const match = stackLines[1].match(/:(\\d+):(\\d+)/); if (match) { ${LINE_NUMBER_VAR} = match[1];} }`;
    }
    s += list[i] + '\n';
  }
  return s;
}

// Separates imports from the code so it can be placed above anonymous async
// function. This is necessary because JS does not support top-level await (yet).
export function transformCode(code: string): JavascriptTransformedCode {
  // from https://stackoverflow.com/a/73265022/1955997
  const regExp =
    // eslint-disable-next-line no-useless-escape
    /^import(?:(?:(?:[ \n\t]+([^ *\n\t\{\},]+)[ \n\t]*(?:,|[ \n\t]+))?([ \n\t]*\{(?:[ \n\t]*[^ \n\t"'\{\}]+[ \n\t]*,?)+\})?[ \n\t]*)|[ \n\t]*\*[ \n\t]*as[ \n\t]+([^ \n\t\{\}]+)[ \n\t]+)from[ \n\t]*(?:['"])([^'"\n]+)(['"])/gm;
  const imports = (code.match(regExp)?.join('\n') || '') + ';';
  let transformedCode = code.replace(regExp, '');
  return { code: transformedCode, imports };
}

// Prepares code to be sent to the worker for execution. This includes moving
// moving import statements outside of async wrapper; adding line number
// variables (although if we get an error, we'll try it without the variables);
// and adding the quadratic libraries and console tracking code.
export function prepareJavascriptCode(
  transform: JavascriptTransformedCode,
  x: number,
  y: number,
  withLineNumbers: boolean
): string {
  const code = withLineNumbers ? javascriptAddLineNumberVars(transform) : transform.code;
  const compiledCode =
    transform.imports +
    (withLineNumbers ? `let ${LINE_NUMBER_VAR} = 0;` : '') +
    javascriptLibrary.replace('{x:0,y:0}', `{x:${x},y:${y}}`) + // replace the pos() with the correct x,y coordinates
    '(async() => {try{' +
    'let results = await (async () => {' +
    code +
    '\n })();' +
    'if (results instanceof OffscreenCanvas) results = await results.convertToBlob();' +
    `self.postMessage({ type: "results", results, console: javascriptConsole.output()${
      withLineNumbers ? `, lineNumber: ${LINE_NUMBER_VAR} - 1` : ''
    } });` +
    `} catch (e) { const error = e.message; const stack = e.stack; self.postMessage({ type: "error", error, stack, console: javascriptConsole.output() }); }` +
    '})();';
  return compiledCode;
}
