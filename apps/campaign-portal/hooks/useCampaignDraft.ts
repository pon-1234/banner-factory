import { useCallback, useEffect, useRef } from "react";
import type { CampaignInput } from "@/lib/formSchema";
import { useToast } from "@chakra-ui/react";

const STORAGE_KEY = "campaign-form-draft";

interface UseCampaignDraftParams {
  methods: {
    getValues: () => CampaignInput;
    reset: (values: Partial<CampaignInput>) => void;
    formState: { isDirty: boolean };
  };
}

export function useCampaignDraft({ methods }: UseCampaignDraftParams) {
  const toast = useToast();
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || hasRestoredRef.current) {
      return;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<CampaignInput>;
        methods.reset(parsed);
        toast({
          title: "保存済みの下書きを読み込みました",
          status: "info",
          duration: 4000,
          isClosable: true
        });
      } catch (err) {
        console.error("Failed to parse draft", err);
      }
    }
    hasRestoredRef.current = true;
  }, [methods, toast]);

  const saveDraft = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    const values = methods.getValues();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    toast({ title: "下書きを保存しました", status: "success", duration: 3000, isClosable: true });
  }, [methods, toast]);

  const clearDraft = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handler = () => {
      if (methods.formState.isDirty) {
        saveDraft();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  }, [methods.formState.isDirty, saveDraft]);

  return { saveDraft, clearDraft };
}
