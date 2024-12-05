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

const revealButton = document.querySelector('#reveal-answers');
revealButton.addEventListener('click', revealAnswers);

const quizContainer = document.querySelector('#quiz-container');
const quizIntro = document.querySelector('#quiz-introduction-default');


async function revealAnswers() {
  showMainTakeaway();
  await chrome.storage.session.get('keyDetails', async ({ mainTakeaway, keyDetails }) => {
    keyDetails.forEach((_, i) => showKeyDetail(i));
  });
};

const keyDetailsElement = document.body.querySelector('#key-details-content');
const mainTakeawayElement = document.body.querySelector('#main-takeaway-content');
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
      ['mainTakeaway', 'keyDetails'],
      async ({ mainTakeaway, keyDetails }) => {
        const { isMainTakeaway, identifiedKeyDetailIndices, feedback } =
          await checkAnswerWithOpenAI(mainTakeaway, keyDetails, userInput);
        if (isMainTakeaway) {
          showMainTakeaway();
        }
        identifiedKeyDetailIndices.forEach((keyDetailIndex) =>
          showKeyDetail(keyDetailIndex)
        );

        if (!isMainTakeaway & (identifiedKeyDetailIndices.length == 0)) {
          console.log('no matches');
          console.log('feedback')
          feedbackElement.textContent = feedback;
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

async function showMainTakeaway() {
  await chrome.storage.session.get('mainTakeaway', async ({ mainTakeaway }) => {
    mainTakeawayElement.textContent = mainTakeaway;
  });
}

// Trigger action when the button is clicked
submitButton.addEventListener('click', handleQuizResponse);

async function loadPageContent(tabId) {
  console.log('Flag: initiate load content for tab', tabId);

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !tab.url.startsWith('http')) {
      console.warn('Invalid tab URL:', tab.url);
      return;
    }

    const injection = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['scripts/extract-content.js']
    });

    const content = injection[0]?.result || '';
    if (!content) {
      console.error('No content extracted from the page.');
      return;
    }

    // Return the content
    return content;
  } catch (error) {
    console.error('Error in loadPageContent:', error);
  }
}

async function generateQuiz() {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (tabs.length > 0) {
      const activeTabId = tabs[0].id;
      const pageContent = await loadPageContent(activeTabId);

      if (pageContent.length > MAX_MODEL_CHARS) {
        // updateWarning(
        //   `Text is too long for summarization with ${pageContent.length} characters (maximum supported content length is ~${MAX_MODEL_CHARS} characters).`
        // );
      } else {
        quizContainer.classList.remove('loaded');
        quizContainer.classList.add('loading');
        quizIntro.classList.add('hidden');
  
        const { mainTakeaway, keyDetails } = await getQuizFromOpenAI(DOMPurify.sanitize(marked.parse(pageContent)));
        mainTakeawayElement.textContent = '?';
        keyDetailsElement.innerHTML = '';
        keyDetails.forEach((_, index) => {
          const li = document.createElement('li');
          li.id = `key-detail-${index}`;
  
          li.textContent = '?';
          keyDetailsElement.appendChild(li);
        });
  
        quizContainer.classList.remove('loading');
  
        setTimeout(() => {
          quizContainer.classList.add('loaded')
        }, 500);
  
        await chrome.storage.session.set({
          mainTakeaway: mainTakeaway,
          keyDetails: keyDetails
        });
      }

    } else {
      console.error("No active tab found.");
    }
  });
}

async function getQuizFromOpenAI(content) {
  try {
    const systemPrompt = `
     You are an assistant that helps readers remember the things they learn in the articles they read. To do so, your task is to identify the **main Takeaway** and **key details** that are most important for a reader to remember in the text.
    
     General Advice:
        - Focus on what the author would want a reader to take away
        - focus on new information, Don't focus on information the writer includes just for background knowledge purposes
        - Imagine what someone would want to say at a dinner party if this topic came up. They'd say "I read an article that said..."
        - It should be very succinct and sound like something you'd say out loud.
        - It should be memorable - the goal is for people to come back to this in the future and test their memory of the article
        - The audience, one can assume, is educated and perhaps knows about the topic already
        - Readers will be tested on their understanding against this information


      1. **Main Takeaway**: The core learning that a reader should take away from the article. 
        - This hsould be the single thing a reader could say to sum up what they learned
        - Not too broad
        - Doesn't need to cover the entire article - just summarize the most important thing
        

      2. **Key details**: Specific pieces of information or arguments made in the article that would be valuable for a reader to remember.
        - Be as specific as possible, keeping in mind that it should be something worth remembering
        - Should focus on new information for the reader, something surprising perhaps, or what someone might share with their friends
        - Include only as many key details as necessary - again, think about how much you think a reader wants to remember from this article even 6 or 12 months from now
        - if the article is extremely information dense, it's your job to pick out the MOST relevant and useful key details for the reader so they aren't overwhelmed

      Return the response in JSON format, structured as follows:
      {
        "mainTakeaway": "Main takeaway sentence here",
        "keyDetails": ["Key detail 1", "Key detail 2", "Key detail 3", ...]
      }.
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

async function checkAnswerWithOpenAI(mainTakeaway, keyDetails, userInput) {
  try {
    const prompt = `
    You are an assistant that checks user-submitted inputs to see if they correctly remember the main Takeaway and/or key details of a given article. You have two main tasks:

    1. Determine whether or not the answer demonstrates that the user understands the main Takeaway of the article. Just a true/false. It's fine if the user's input is a bit vague, as long as it is clear that they understood and remember then it should be a match

    2. List correctly identified key details. If the input demonstrates that the user effectively remembers the detail, enough so to describe it succinctly at a cocktail party and be clear and convincing, it should count as a match. Each key detail is assigned an index. Your job is to return a list of indices for the key details identified in the user's input. If no matches are found, return an empty list.

    3. Give a very short, quippy, helpful piece of feedback that doesn't give away ANY information from the key details or main idea. Say no match and then just a few words of helpful feedback. Think like you're a teacher and your student is an adult. Not overly peppy. No need for full sentences.

    Here is the informaiton on the article:

    **Main Takeaway**:
      "${mainTakeaway}"

    **User Input**:
      "${userInput}"

    **Key Details (with indices)**:
      ${keyDetails.map((detail, index) => `${index}: "${detail}"`).join('\n')}

    Return the response in JSON format, structured as follows:
    {
      "isMainTakeaway": true of false here,
      "identifiedKeyDetailIndices": ["first identified index", "second identified index", ...],
      "feedback": "simple feedback here"
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
        temperature: 0.2,
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


