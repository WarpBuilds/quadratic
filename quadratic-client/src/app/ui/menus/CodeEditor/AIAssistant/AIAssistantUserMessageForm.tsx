import { aiAssistantAbortControllerAtom, aiAssistantLoadingAtom } from '@/app/atoms/codeEditorAtom';
import type { AIUserMessageFormWrapperProps } from '@/app/ui/components/AIUserMessageForm';
import { AIUserMessageForm } from '@/app/ui/components/AIUserMessageForm';
import { useSubmitAIAssistantPrompt } from '@/app/ui/menus/CodeEditor/hooks/useSubmitAIAssistantPrompt';
import mixpanel from 'mixpanel-browser';
import { forwardRef, memo } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';

export const AIAssistantUserMessageForm = memo(
  forwardRef<HTMLTextAreaElement, AIUserMessageFormWrapperProps>((props: AIUserMessageFormWrapperProps, ref) => {
    const abortController = useRecoilValue(aiAssistantAbortControllerAtom);
    const [loading, setLoading] = useRecoilState(aiAssistantLoadingAtom);
    const { submitPrompt } = useSubmitAIAssistantPrompt();

    return (
      <AIUserMessageForm
        {...props}
        abortController={abortController}
        loading={loading}
        setLoading={setLoading}
        submitPrompt={(prompt) => {
          mixpanel.track('[AIAssistant].submitPrompt');
          submitPrompt({ userPrompt: prompt, messageIndex: props.messageIndex });
        }}
      />
    );
  })
);
