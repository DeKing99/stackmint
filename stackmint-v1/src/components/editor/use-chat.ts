'use client';

import * as React from 'react';

import { type UseChatHelpers, useChat as useBaseChat } from '@ai-sdk/react';
import { AIChatPlugin, aiCommentToRange } from '@platejs/ai/react';
import { getCommentKey, getTransientCommentKey } from '@platejs/comment';
import { deserializeMd } from '@platejs/markdown';
import { type UIMessage } from 'ai';
import { type TNode, KEYS, nanoid, NodeApi, TextApi } from 'platejs';
import { type PlateEditor, useEditorRef, usePluginOption } from 'platejs/react';

import { aiChatPlugin } from '@/components/editor/plugins/ai-kit';
import { discussionPlugin } from './plugins/discussion-kit';

export type ToolName = 'comment' | 'edit' | 'generate';

export type TComment = {
  blockId: string;
  comment: string;
  content: string;
};

export type MessageDataPart = {
  toolName: ToolName;
  comment?: TComment;
};

export type Chat = UseChatHelpers;
export type ChatMessage = UIMessage;

export const useChat = () => {
  const editor = useEditorRef();
  const options = usePluginOption(aiChatPlugin, 'chatOptions');

  const baseChat = useBaseChat({
    id: 'editor',
    api: '/api/ai/command',

    // Fires once when the response starts
    onResponse: async (response) => {
      console.log('AI response started:', response);
    },

    // Fires once after the full response is streamed
    onFinish: async (message) => {
      console.log('AI response finished:', message);

      // Expect the AI to return structured JSON in `message.data`
      // Example: { type: "data-comment", data: { comment: "...", content: "..." } }
      try {
        const parsed = message.data as { type: string; data?: any };

        if (!parsed) return;

        if (parsed.type === 'data-toolName') {
          editor.setOption(AIChatPlugin, 'toolName', parsed.data);
        }

        if (parsed.type === 'data-comment' && parsed.data) {
          const aiComment = parsed.data;
          const range = aiCommentToRange(editor, aiComment);

          if (!range) {
            console.warn('No range found for AI comment');
            return;
          }

          const discussions =
            editor.getOption(discussionPlugin, 'discussions') || [];

          const discussionId = nanoid();

          const newComment = {
            id: nanoid(),
            contentRich: [{ children: [{ text: aiComment.comment }], type: 'p' }],
            createdAt: new Date(),
            discussionId,
            isEdited: false,
            userId: editor.getOption(discussionPlugin, 'currentUserId'),
          };

          const newDiscussion = {
            id: discussionId,
            comments: [newComment],
            createdAt: new Date(),
            documentContent: deserializeMd(editor, aiComment.content)
              .map((node: TNode) => NodeApi.string(node))
              .join('\n'),
            isResolved: false,
            userId: editor.getOption(discussionPlugin, 'currentUserId'),
          };

          editor.setOption(discussionPlugin, 'discussions', [
            ...discussions,
            newDiscussion,
          ]);

          editor.tf.withMerging(() => {
            editor.tf.setNodes(
              {
                [getCommentKey(newDiscussion.id)]: true,
                [getTransientCommentKey()]: true,
                [KEYS.comment]: true,
              },
              {
                at: range,
                match: TextApi.isText,
                split: true,
              }
            );
          });
        }
      } catch (err) {
        console.error('Failed to parse AI response data:', err);
      }
    },

    ...options,
  });

  const chat = { ...baseChat };

  React.useEffect(() => {
    editor.setOption(AIChatPlugin, 'chat', chat);
  }, [chat.status, chat.messages, chat.error]);

  return chat;
};
