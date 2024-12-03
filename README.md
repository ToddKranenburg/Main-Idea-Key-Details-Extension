## Running this extension

1. Clone this repository
1. Run `npm install` in this folder to install all dependencies.
1. Insert a valid OpenAI API key in the index.js file (`const openAIApiKey = ...`)
1. Run `npm run build` to build the extension.
1. Load the newly created `dist` directory in Chrome as an [unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).
1. Click the extension icon to open the summary side panel.
1. Open any web page, generate a quiz, and start guessing!