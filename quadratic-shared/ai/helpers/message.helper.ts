import type {
  AIMessagePrompt,
  ChatMessage,
  Content,
  ImageContent,
  PdfFileContent,
  SystemMessage,
  TextContent,
  TextFileContent,
  ToolResultContextType,
  ToolResultMessage,
  UserMessagePrompt,
  UserPromptContextType,
} from 'quadratic-shared/typesAndSchemasAI';

export const getSystemMessages = (messages: ChatMessage[]): string[] => {
  const systemMessages: SystemMessage[] = messages.filter<SystemMessage>(
    (message): message is SystemMessage =>
      message.role === 'user' && message.contextType !== 'userPrompt' && message.contextType !== 'toolResult'
  );
  return systemMessages.flatMap((message) => message.content.map((content) => content.text));
};

export const getPromptMessages = (
  messages: ChatMessage[]
): (UserMessagePrompt | ToolResultMessage | AIMessagePrompt)[] => {
  return messages.filter(
    (message): message is UserMessagePrompt | ToolResultMessage | AIMessagePrompt =>
      message.contextType === 'userPrompt' || message.contextType === 'toolResult'
  );
};

export const getUserPromptMessages = (messages: ChatMessage[]): (UserMessagePrompt | ToolResultMessage)[] => {
  return getPromptMessages(messages).filter(
    (message): message is UserMessagePrompt | ToolResultMessage => message.role === 'user'
  );
};

export const getLastPromptMessageType = (messages: ChatMessage[]): UserPromptContextType | ToolResultContextType => {
  const userPromptMessage = getUserPromptMessages(messages);
  return userPromptMessage[userPromptMessage.length - 1].contextType;
};

export const getLastUserPromptMessageIndex = (messages: ChatMessage[]): number => {
  return getUserPromptMessages(messages).length - 1;
};

export const getSystemPromptMessages = (
  messages: ChatMessage[]
): { systemMessages: string[]; promptMessages: ChatMessage[] } => {
  // send internal context messages as system messages
  const systemMessages: string[] = getSystemMessages(messages);
  const promptMessages = getPromptMessages(messages);

  // send all messages as prompt messages
  // const systemMessages: string[] = [];
  // const promptMessages = messages;

  return { systemMessages, promptMessages };
};

export const isToolResultMessage = (message: ChatMessage): message is ToolResultMessage => {
  return message.role === 'user' && message.contextType === 'toolResult';
};

export const isContentText = (content: Content[number]): content is TextContent => {
  return content.type === 'text';
};

export const isContentImage = (content: Content[number]): content is ImageContent => {
  return content.type === 'data' && ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(content.mimeType);
};

export const isContentPdfFile = (content: Content[number]): content is PdfFileContent => {
  return content.type === 'data' && content.mimeType === 'application/pdf';
};

export const isContentTextFile = (content: Content[number]): content is TextFileContent => {
  return content.type === 'data' && content.mimeType === 'text/plain';
};
