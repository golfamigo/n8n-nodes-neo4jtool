import { bu as NodeConnectionTypes } from "./index-BolKFsR6.js";
const getEasyAiWorkflowJson = ({
  isInstanceInAiFreeCreditsExperiment,
  withOpenAiFreeCredits
}) => {
  let instructionsFirstStep = "Set up your [OpenAI credentials](https://docs.n8n.io/integrations/builtin/credentials/openai/?utm_source=n8n_app&utm_medium=credential_settings&utm_campaign=create_new_credentials_modal) in the `OpenAI Model` node";
  if (isInstanceInAiFreeCreditsExperiment) {
    instructionsFirstStep = `Claim your \`free\` ${withOpenAiFreeCredits} OpenAI calls in the \`OpenAI model\` node`;
  }
  return {
    name: "Demo: My first AI Agent in n8n",
    meta: {
      templateId: "PT1i+zU92Ii5O2XCObkhfHJR5h9rNJTpiCIkYJk9jHU="
    },
    nodes: [
      {
        id: "0d7e4666-bc0e-489a-9e8f-a5ef191f4954",
        name: "Google Calendar",
        type: "n8n-nodes-base.googleCalendarTool",
        typeVersion: 1.2,
        position: [880, 220],
        parameters: {
          operation: "getAll",
          calendar: {
            __rl: true,
            mode: "list"
          },
          returnAll: true,
          options: {
            timeMin: "={{ $fromAI('after', 'The earliest datetime we want to look for events for') }}",
            timeMax: "={{ $fromAI('before', 'The latest datetime we want to look for events for') }}",
            query: "={{ $fromAI('query', 'The search query to look for in the calendar. Leave empty if no search query is needed') }}",
            singleEvents: true
          }
        }
      },
      {
        id: "5b410409-5b0b-47bd-b413-5b9b1000a063",
        name: "When chat message received",
        type: "@n8n/n8n-nodes-langchain.chatTrigger",
        typeVersion: 1.1,
        position: [360, 20],
        webhookId: "a889d2ae-2159-402f-b326-5f61e90f602e",
        parameters: {
          options: {}
        }
      },
      {
        id: "29963449-1dc1-487d-96f2-7ff0a5c3cd97",
        name: "AI Agent",
        type: "@n8n/n8n-nodes-langchain.agent",
        typeVersion: 1.7,
        position: [560, 20],
        parameters: {
          options: {
            systemMessage: "=You're a helpful assistant that helps the user answer questions about their calendar.\n\nToday is {{ $now.format('cccc') }} the {{ $now.format('yyyy-MM-dd HH:mm') }}."
          }
        }
      },
      {
        id: "eae35513-07c2-4de2-a795-a153b6934c1b",
        name: "Sticky Note",
        type: "n8n-nodes-base.stickyNote",
        typeVersion: 1,
        position: [0, 0],
        parameters: {
          content: `## 👋 Welcome to n8n!
This example shows how to build an AI Agent that interacts with your 
calendar.

### 1. Connect your accounts
- ${instructionsFirstStep} 
- Connect your Google account in the \`Google Calendar\` node credentials section

### 2. Ready to test it?
Click Chat below and start asking questions! For example you can try \`What meetings do I have today?\``,
          height: 389,
          width: 319,
          color: 6
        }
      },
      {
        id: "68b59889-7aca-49fd-a49b-d86fa6239b96",
        name: "Sticky Note1",
        type: "n8n-nodes-base.stickyNote",
        typeVersion: 1,
        position: [820, 200],
        parameters: {
          content: "\n\n\n\n\n\n\n\n\n\n\n\nDon't have **Google Calendar**? Simply exchange this with the **Microsoft Outlook** or other tools",
          height: 253,
          width: 226,
          color: 7
        }
      },
      {
        id: "cbaedf86-9153-4778-b893-a7e50d3e04ba",
        name: "OpenAI Model",
        type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
        typeVersion: 1,
        position: [520, 220],
        parameters: {
          options: {}
        }
      },
      {
        id: "75481370-bade-4d90-a878-3a3b0201edcc",
        name: "Memory",
        type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
        typeVersion: 1.3,
        position: [680, 220],
        parameters: {}
      },
      {
        id: "907552eb-6e0f-472e-9d90-4513a67a31db",
        name: "Sticky Note3",
        type: "n8n-nodes-base.stickyNote",
        typeVersion: 1,
        position: [0, 400],
        parameters: {
          content: "### Want to learn more?\nWant to learn more about AI and how to apply it best in n8n? Have a look at our [new tutorial series on YouTube](https://www.youtube.com/watch?v=yzvLfHb0nqE&lc).",
          height: 100,
          width: 317,
          color: 6
        }
      }
    ],
    connections: {
      "Google Calendar": {
        ai_tool: [
          [
            {
              node: "AI Agent",
              type: NodeConnectionTypes.AiTool,
              index: 0
            }
          ]
        ]
      },
      "When chat message received": {
        main: [
          [
            {
              node: "AI Agent",
              type: NodeConnectionTypes.Main,
              index: 0
            }
          ]
        ]
      },
      "OpenAI Model": {
        ai_languageModel: [
          [
            {
              node: "AI Agent",
              type: NodeConnectionTypes.AiLanguageModel,
              index: 0
            }
          ]
        ]
      },
      Memory: {
        ai_memory: [
          [
            {
              node: "AI Agent",
              type: NodeConnectionTypes.AiMemory,
              index: 0
            }
          ]
        ]
      }
    },
    settings: {
      executionOrder: "v1"
    },
    pinData: {}
  };
};
export {
  getEasyAiWorkflowJson as g
};
