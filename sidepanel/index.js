import DOMPurify from 'dompurify';
import { marked } from 'marked';

import { OPEN_AI_API_KEY, OPEN_AI_ENDPOINT } from '../config.js';

// Each token corresponds, roughly, to about 4 characters, so 40,000
// is used as a limit to warn the user the content might be too long
const MAX_MODEL_CHARS = 400000;
console.log('loaded index.js');

// let pageContent = '';

const generateQuizButton = document.querySelector('#generate');
generateQuizButton.addEventListener('click', generateQuiz);

const revealButton = document.getElementById('reveal-answers');
revealButton.addEventListener('click', revealAnswers);

async function revealAnswers() {
  showMainIdea();
  await chrome.storage.session.get('keyDetails', async ({ mainIdea, keyDetails }) => {
    keyDetails.forEach((_, i) => showKeyDetail(i));
  });
};

const keyDetailsElement = document.body.querySelector('#key-details-content');
const mainIdeaElement = document.body.querySelector('#main-idea-content');
const feedbackElement = document.body.querySelector('#response-feedback');

const inputField = document.getElementById('quiz-input');
const submitButton = document.getElementById('submit-button');

// Trigger action when "Enter" is pressed
inputField.addEventListener('keypress', async (event) => {
  if (event.key === 'Enter') {
    await handleQuizResponse();
  }
});

// Function to handle quiz response submission
async function handleQuizResponse() {
  const userInput = inputField.value.trim();
  if (userInput) {
    console.log(`User response: ${userInput}`);

    await chrome.storage.session.get(
      ['mainIdea', 'keyDetails'],
      async ({ mainIdea, keyDetails }) => {
        const { isMainIdea, identifiedKeyDetailIndices } =
          await checkAnswerWithOpenAI(mainIdea, keyDetails, userInput);
        if (isMainIdea) {
          showMainIdea();
        }
        identifiedKeyDetailIndices.forEach((keyDetailIndex) =>
          showKeyDetail(keyDetailIndex)
        );

        if (!isMainIdea & (identifiedKeyDetailIndices.length == 0)) {
          console.log('no matches');
          feedbackElement.textContent = 'No matches';
          feedbackElement.style.display = 'block';
        } else {
          feedbackElement.style.display = 'none';
        }
      }
    );

    inputField.value = ''; // Clear the input field
  }
}

async function showKeyDetail(index) {
  const keyDetailElement = document.getElementById(`key-detail-${index}`);
  await chrome.storage.session.get('keyDetails', async ({ keyDetails }) => {
    keyDetailElement.textContent = keyDetails[index];
  });
}

async function showMainIdea() {
  await chrome.storage.session.get('mainIdea', async ({ mainIdea }) => {
    mainIdeaElement.textContent = mainIdea;
  });
}

// Trigger action when the button is clicked
submitButton.addEventListener('click', handleQuizResponse);

async function generateQuiz() {
  chrome.storage.session.get('pageContent', async ({ pageContent }) => {
    if (pageContent.length > MAX_MODEL_CHARS) {
      // updateWarning(
      //   `Text is too long for summarization with ${pageContent.length} characters (maximum supported content length is ~${MAX_MODEL_CHARS} characters).`
      // );
    } else {
      mainIdeaElement.textContent = '?';
      keyDetailsElement.innerHTML = '';
      const { mainIdea, keyDetails } = await getQuizFromOpenAI(pageContent);
      // mainIdeaElement.innerHTML = DOMPurify.sanitize(marked.parse(mainIdea));
      keyDetails.forEach((_, index) => {
        const li = document.createElement('li');
        li.id = `key-detail-${index}`;

        li.textContent = '?';
        keyDetailsElement.appendChild(li);
      });

      await chrome.storage.session.set({
        mainIdea: mainIdea,
        keyDetails: keyDetails
      });
    }
  });
}


async function checkAnswerWithOpenAI(mainIdea, keyDetails, userInput) {
  try {
    const prompt = `
    You are an assistant that checks user-submitted inputs to see if they correctly remember the main idea and/or key details of a given article. You have two main tasks:

    1. Determine whether or not the answer demonstrates that the user understands the main idea of the article. Just a true/false. It's fine if the user's input is a bit vague, as long as it is clear that they understood and remember then it should be a match

    2. List correctly identified key details. If the input demonstrates that the user effectively remembers the detail, enough so to describe it succinctly at a cocktail party and be clear and convincing, it should count as a match. Each key detail is assigned an index. Your job is to return a list of indices for the key details identified in the user's input. If no matches are found, return an empty list.

    Here is the informaiton on the article:

    **Main Idea**:
      "${mainIdea}"

    **User Input**:
      "${userInput}"

    **Key Details (with indices)**:
      ${keyDetails.map((detail, index) => `${index}: "${detail}"`).join('\n')}

    Return the response in JSON format, structured as follows:
    {
      "isMainIdea": true of false here,
      "identifiedKeyDetailIndices": ["first identified index", "second identified index", ...]
    }.
    `;
    console.log('prompt: ', prompt);
    const response = await fetch(OPEN_AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPEN_AI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.0,
        max_tokens: 100
      })
    });

    const result = await response.json();
    if (response.ok) {
      console.log('response from OpenAI: ', result);
      return JSON.parse(result.choices[0].message.content);
    } else {
      console.error('OpenAI API error:', result);
      return 'Error: Unable to summarize the article.';
    }
  } catch (error) {
    console.error('Fetch error:', error);
    return 'Error: Unable to connect to OpenAI.';
  }
}

async function getQuizFromOpenAI(content) {
  try {
    const systemPrompt = `
     You are an assistant that helps readers remember the things they learn in the articles they read. To do so, your task is to identify the **main idea** and **key details** that are most important for a reader to remember in the text.

      1. **Main Idea**: the main takeaway that readers should have from the article. focus on the primary piece of new insight, information, perspective, etc that the author intended the reader to come away with. This should be what a reader might say when they describe what they learned from the article to someone at a dinner party.

      2. **Key details**: these are the specifics within the article that support the main idea. Think of them as evidence, or sometimes like logical steps in an argument. Or you can think of them like the specific things that a reader might want to mention to explain more on what they learned from the article at a dinner party. Each detail should:
        - Be concise
        - Include relevant details from the article that support the main idea.
        - Avoid generalizations, redundancies, or overly broad statements.
        - Point to specific and most convincing evidence
        - Represent likely new information for the reader

      If the article does not include enough material for 5 key details, provide only the relevant ones.
      Focus on clarity, specificity, and utility for adult, educated readers who want to understand and retain the content.
      You do not need to write in perfect, complete sentences. 

      Return the response in JSON format, structured as follows:
      {
        "mainIdea": "Main idea sentence here",
        "keyDetails": ["Key detail 1", "Key detail 2", "Key detail 3", ...]
      }.
      Make the key details as concise and specific as possible.
      `;
    const response = await fetch(OPEN_AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPEN_AI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: content }
        ],
        temperature: 0.7,
        max_tokens: 300
      })
    });

    const result = await response.json();
    if (response.ok) {
      return JSON.parse(result.choices[0].message.content);
    } else {
      console.error('OpenAI API error:', result);
      return 'Error: Unable to summarize the article.';
    }
  } catch (error) {
    console.error('Fetch error:', error);
    return 'Error: Unable to connect to OpenAI.';
  }
}
