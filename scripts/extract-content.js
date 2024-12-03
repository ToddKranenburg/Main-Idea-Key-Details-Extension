import { isProbablyReaderable, Readability } from '@mozilla/readability';

function canBeParsed(document) {
  return isProbablyReaderable(document, {
    minContentLength: 100
  });
}

function parse(document) {
  if (!canBeParsed(document)) {
    console.log('cannot be parsed');
    return false;
  }
  console.log('can be parsed');
  const documentClone = document.cloneNode(true);
  const article = new Readability(documentClone).parse();
  return article.textContent;
}
console.log('script is running');
parse(window.document);
