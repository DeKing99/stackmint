import type {
  ChatMessage,
  ToolName,
} from '@/components/editor/use-chat';
import type { NextRequest } from 'next/server';

import { replacePlaceholders } from '@platejs/ai';
import { serializeMd } from '@platejs/markdown';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai';

import { NextResponse } from 'next/server';
import { type SlateEditor, createSlateEditor, nanoid, RangeApi } from 'platejs';

import { BaseEditorKit } from '@/components/editor/editor-base-kit';

// Helper to call the Python backend
async function callPythonBackend(endpoint: string, payload: any) {
  const res = await fetch(`http://localhost:8000/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Python backend error');
  return res.json();
}

export async function POST(req: NextRequest) {
  const { ctx, messages: messagesRaw } = await req.json();

  const { children, selection, toolName: toolNameParam } = ctx;

  const editor = createSlateEditor({
    plugins: BaseEditorKit,
    selection,
    value: children,
  });

  const isSelecting = editor.api.isExpanded();

  try {
    const stream = createUIMessageStream<ChatMessage>({
      execute: async ({ writer }: { writer: any }) => {
        const lastIndex = messagesRaw.findIndex(
          (message: any) => message.role === 'user'
        );

        const messages = [...messagesRaw];

        messages[lastIndex] = replaceMessagePlaceholders(
          editor,
          messages[lastIndex],
          {
            isSelecting,
          }
        );

        const lastUserMessage = messages[lastIndex];

        let toolName = toolNameParam;

        // Tool selection: ask backend if not provided
        if (!toolName) {
          const { tool } = await callPythonBackend('report-ai-generation', {
            action: 'choose_tool',
            isSelecting,
            lastUserMessage,
          });

          writer.write({
            data: tool as ToolName,
            type: 'data-toolName',
          });

          toolName = tool;
        }

        // GENERATE
        if (toolName === 'generate') {
          const generateSystem = replacePlaceholders(
            editor,
            generateSystemTemplate({ isSelecting })
          );

          const response = await callPythonBackend('report-ai-generation', {
            action: 'generate',
            messages: convertToModelMessages(messages),
            system: generateSystem,
            isSelecting,
          });

          // Stream the response as a single message
          writer.write({
            data: response.text,
            type: 'data-generate',
          });
        }

        // EDIT
        if (toolName === 'edit') {
          if (!isSelecting)
            throw new Error('Edit tool is only available when selecting');

          const editSystem = replacePlaceholders(editor, editSystemTemplate());

          const response = await callPythonBackend('report-ai-generation', {
            action: 'edit',
            messages: convertToModelMessages(messages),
            system: editSystem,
            isSelecting,
          });

          writer.write({
            data: response.text,
            type: 'data-edit',
          });
        }

        // COMMENT
        if (toolName === 'comment') {
          const lastUserMessage = messagesRaw[lastIndex] as ChatMessage;
          const textPart = lastUserMessage.parts.find(
            (
              part
            ): part is Extract<(typeof lastUserMessage.parts)[number], { type: 'text' }> =>
              part.type === 'text' && 'text' in part
          );
          const prompt = textPart?.text;

          const commentPrompt = replacePlaceholders(
            editor,
            commentPromptTemplate({ isSelecting }),
            {
              prompt,
            }
          );

          const response = await callPythonBackend('report-ai-generation', {
            action: 'comment',
            prompt: removeEscapeSelection(editor, commentPrompt),
            isSelecting,
          });

          // Assume response.comments is an array of comment objects
          for (const comment of response.comments) {
            const commentDataId = nanoid();
            writer.write({
              id: commentDataId,
              data: comment,
              type: 'data-comment',
            });
          }
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch {
    return NextResponse.json(
      { error: 'Failed to process AI request' },
      { status: 500 }
    );
  }
}

const generateSystemTemplate = ({ isSelecting }: { isSelecting: boolean }) => {
  return isSelecting
    ? PROMPT_TEMPLATES.generateSystemDefault
    : PROMPT_TEMPLATES.generateSystemSelecting;
};

const editSystemTemplate = () => {
  return PROMPT_TEMPLATES.editSystemSelecting;
};

const promptTemplate = ({ isSelecting }: { isSelecting: boolean }) => {
  return isSelecting
    ? PROMPT_TEMPLATES.promptSelecting
    : PROMPT_TEMPLATES.promptDefault;
};

const commentPromptTemplate = ({ isSelecting }: { isSelecting: boolean }) => {
  return isSelecting
    ? PROMPT_TEMPLATES.commentPromptSelecting
    : PROMPT_TEMPLATES.commentPromptDefault;
};

const systemCommon = `\
You are an advanced AI-powered note-taking assistant, designed to enhance productivity and creativity in note management.
Respond directly to user prompts with clear, concise, and relevant content. Maintain a neutral, helpful tone.

Rules:
- <Document> is the entire note the user is working on.
- <Reminder> is a reminder of how you should reply to INSTRUCTIONS. It does not apply to questions.
- Anything else is the user prompt.
- Your response should be tailored to the user's prompt, providing precise assistance to optimize note management.
- For INSTRUCTIONS: Follow the <Reminder> exactly. Provide ONLY the content to be inserted or replaced. No explanations or comments.
- For QUESTIONS: Provide a helpful and concise answer. You may include brief explanations if necessary.
- CRITICAL: DO NOT remove or modify the following custom MDX tags: <u>, <callout>, <kbd>, <toc>, <sub>, <sup>, <mark>, <del>, <date>, <span>, <column>, <column_group>, <file>, <audio>, <video> in <Selection> unless the user explicitly requests this change.
- CRITICAL: Distinguish between INSTRUCTIONS and QUESTIONS. Instructions typically ask you to modify or add content. Questions ask for information or clarification.
- CRITICAL: when asked to write in markdown, do not start with \`\`\`markdown.
- CRITICAL: When writing the column, such line breaks and indentation must be preserved.
<column_group>
  <column>
    1
  </column>
  <column>
    2
  </column>
  <column>
    3
  </column>
</column_group>
`;

const generateSystemDefault = `\
${systemCommon}
- <Block> is the current block of text the user is working on.

<Block>
{block}
</Block>
`;

const generateSystemSelecting = `\
${systemCommon}
- <Block> contains the text context. You will always receive one <Block>.
- <selection> is the text highlighted by the user.
`;

const editSystemSelecting = `\
- <Block> shows the full sentence or paragraph, only for context. 
- <Selection> is the exact span of text inside <Block> that must be replaced. 
- Your output MUST be only the replacement string for <Selection>, with no tags. 
- Never output <Block> or <Selection> tags, and never output surrounding text. 
- The replacement must be grammatically correct when substituted back into <Block>. 
- Ensure the replacement fits seamlessly so the whole <Block> reads naturally. 
- Output must be limited to the replacement string itself.
- Do not remove the \\n in the original text
`;

const promptDefault = `<Reminder>
CRITICAL: NEVER write <Block>.
</Reminder>
{prompt}`;

const promptSelecting = `<Reminder>
If this is a question, provide a helpful and concise answer about <Selection>.
If this is an instruction, provide ONLY the text to replace <Selection>. No explanations.
Ensure it fits seamlessly within <Block>. If <Block> is empty, write ONE random sentence.
NEVER write <Block> or <Selection>.
</Reminder>
{prompt} about <Selection>

<Block>
{block}
</Block>
`;

const commentPromptSelecting = `
Comment on the content within the <Selection>.
Never write <Selection>.
{prompt}:
        
{blockWithBlockId}
`;

const commentPromptDefault = `{prompt}:
        
{editorWithBlockId}
`;

const PROMPT_TEMPLATES = {
  commentPromptDefault,
  commentPromptSelecting,
  editSystemSelecting,
  generateSystemDefault,
  generateSystemSelecting,
  promptDefault,
  promptSelecting,
};

const replaceMessagePlaceholders = (
  editor: SlateEditor,
  message: ChatMessage,
  { isSelecting }: { isSelecting: boolean }
): ChatMessage => {
  if (isSelecting) addSelection(editor);

  const template = promptTemplate({ isSelecting });

  const parts: typeof message.parts = message.parts.map((part) => {
    if (part.type !== 'text' || !("text" in part) || !part.text) return part;

    let text: string = replacePlaceholders(editor, template, {
      prompt: part.text,
    });

    if (isSelecting) text = removeEscapeSelection(editor, text);

    return { ...part, text };
  }) as typeof message.parts;

  return { ...message, parts };
};

const SELECTION_START = '<Selection>';
const SELECTION_END = '</Selection>';

const addSelection = (editor: SlateEditor) => {
  if (!editor.selection) return;

  if (editor.api.isExpanded()) {
    const [start, end] = RangeApi.edges(editor.selection);

    editor.tf.withoutNormalizing(() => {
      editor.tf.insertText(SELECTION_END, {
        at: end,
      });

      editor.tf.insertText(SELECTION_START, {
        at: start,
      });
    });
  }
};

const removeEscapeSelection = (editor: SlateEditor, text: string) => {
  let newText = text
    .replace(`\\${SELECTION_START}`, SELECTION_START)
    .replace(`\\${SELECTION_END}`, SELECTION_END);

  // If the selection is on a void element, inserting the placeholder will fail, and the string must be replaced manually.
  if (!newText.includes(SELECTION_END)) {
    const [, end] = RangeApi.edges(editor.selection!);

    const node = editor.api.block({ at: end.path });

    if (!node) return newText;

    if (editor.api.isVoid(node[0])) {
      const voidString = serializeMd(editor, { value: [node[0]] });

      const idx = newText.lastIndexOf(voidString);

      if (idx !== -1) {
        newText =
          newText.slice(0, idx) +
          voidString.trimEnd() +
          SELECTION_END +
          newText.slice(idx + voidString.length);
      }
    }
  }

  return newText;
};
