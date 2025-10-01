import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Divider,
  HStack,
  Icon,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  useDisclosure,
  useToast
} from "@chakra-ui/react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { z } from "zod";
import { useRouter } from "next/router";

import { FormField } from "@/components/input/FormField";
import { WizardLayout } from "@/components/layout/WizardLayout";
import { PreviewPanel } from "@/components/layout/PreviewPanel";
import type { CampaignInput } from "@/lib/formSchema";
import { CampaignInputSchema } from "@/lib/formSchema";
import type { FieldKey } from "@/lib/fieldConfig";
import { useCampaignDraft } from "@/hooks/useCampaignDraft";
import { createCampaign, logSubmission } from "@/lib/api";
import { RepeatIcon } from "@chakra-ui/icons";

const errorMap: z.ZodErrorMap = (issue, ctx) => {
  if (issue.code === z.ZodIssueCode.invalid_type && issue.received === "undefined") {
    return { message: "必須項目です" };
  }
  if (issue.code === z.ZodIssueCode.too_small && issue.minimum === 1) {
    return { message: "必須項目です" };
  }
  if (issue.code === z.ZodIssueCode.too_big && typeof issue.maximum === "number") {
    return { message: `最大${issue.maximum}件まで入力できます` };
  }
  if (issue.code === z.ZodIssueCode.invalid_enum_value) {
    return { message: "選択肢の中から選んでください" };
  }
  if (issue.code === z.ZodIssueCode.invalid_string && issue.validation === "url") {
    return { message: "URL形式で入力してください" };
  }
  if (issue.code === z.ZodIssueCode.invalid_string && issue.validation === "regex") {
    return { message: "形式を確認してください" };
  }
  if (issue.code === z.ZodIssueCode.custom && issue.message) {
    if (issue.message === "stat_claim requires both stat_note and stat_evidence_url") {
      return { message: "数値訴求を入力した場合は根拠と注記が必要です" };
    }
    return { message: issue.message };
  }
  return { message: ctx.defaultError };
};

const schema = CampaignInputSchema.superRefine((data, ctx) => {
  if (data.pain_points?.some((item) => item.length > 30)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pain_points"],
      message: "課題は30文字以内で入力してください"
    });
  }
  if (data.cta_type && data.cta_type.length > 12) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["cta_type"],
      message: "CTAは12文字以内で入力してください"
    });
  }
  const VALUE_LIMIT = 24;
  data.value_props?.forEach((item, index) => {
    if (item.length > VALUE_LIMIT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value_props", index],
        message: `${VALUE_LIMIT}文字以内で入力してください`
      });
    }
  });
  data.value_props_secondary?.forEach((item, index) => {
    if (item.length > VALUE_LIMIT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value_props_secondary", index],
        message: `${VALUE_LIMIT}文字以内で入力してください`
      });
    }
  });
  if (data.stat_claim) {
    if (!data.stat_evidence_url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stat_evidence_url"], message: "必須項目です" });
    }
    if (!data.stat_note) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stat_note"], message: "必須項目です" });
    }
  }
});

const wizardSteps: Array<{ id: string; title: string; description: string; fields: FieldKey[] }> = [
  {
    id: "basic",
    title: "基本情報",
    description: "ブランド・LP・目的などの基本情報を入力します",
    fields: ["brand_name", "lp_url", "objective", "tone", "style_code"]
  },
  {
    id: "messaging",
    title: "メッセージ設計",
    description: "ターゲットや課題、価値提案を整理します",
    fields: [
      "target_note",
      "pain_points",
      "pain_points_secondary",
      "value_props",
      "value_props_secondary",
      "cta_type"
    ]
  },
  {
    id: "visual",
    title: "視覚要素",
    description: "ブランドカラーや参考素材を指定します",
    fields: ["brand_color_hex", "logo_url", "reference_banners", "bg_style_refs", "forbidden_phrases"]
  },
  {
    id: "legal",
    title: "法務情報",
    description: "実績・注記などのコンプライアンス情報を確認します",
    fields: ["stat_claim", "stat_evidence_url", "stat_note", "disclaimer_code"]
  },
  {
    id: "confirm",
    title: "送信内容の確認",
    description: "送信内容を最終確認し、レンダー依頼へ進みます",
    fields: []
  }
];

const emptyDefaults: CampaignInput = {
  lp_url: "",
  brand_name: "",
  objective: "相談",
  target_note: "",
  pain_points: [] as unknown as CampaignInput["pain_points"],
  value_props: [] as unknown as CampaignInput["value_props"],
  cta_type: "",
  brand_color_hex: "#1A202C",
  logo_url: "",
  forbidden_phrases: [],
  reference_banners: [],
  bg_style_refs: [],
  stat_claim: undefined,
  stat_evidence_url: undefined,
  stat_note: undefined,
  disclaimer_code: undefined,
  tone: undefined,
  style_code: "AUTO",
  pain_points_secondary: [],
  value_props_secondary: []
};

function flattenErrors(errors: Record<string, any>): string[] {
  const messages: string[] = [];
  for (const [field, value] of Object.entries(errors)) {
    if (!value) continue;
    if (value.message) {
      messages.push(`${field}: ${value.message}`);
    }
    if (value.types) {
      messages.push(`${field}: ${Object.values(value.types).join(",")}`);
    }
    if (value.ref) {
      continue;
    }
    if (value instanceof Object && !(value.message || value.types)) {
      messages.push(...flattenErrors(value));
    }
  }
  return messages;
}

export default function CampaignFormPage() {
  const toast = useToast();
  const router = useRouter();
  const formMethods = useForm<CampaignInput>({
    resolver: zodResolver(schema, { errorMap }),
    mode: "onChange",
    defaultValues: emptyDefaults
  });
  const { saveDraft, clearDraft } = useCampaignDraft({ methods: formMethods });
  const [currentStep, setCurrentStep] = useState(0);
  const [metadata, setMetadata] = useState<{ title?: string; description?: string; ogImage?: string }>();
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const errorModal = useDisclosure();

  const stepConfig = wizardSteps[currentStep];
  const totalSteps = wizardSteps.length;
  const statClaim = formMethods.watch("stat_claim");
  const lpUrl = formMethods.watch("lp_url");

  const summaryErrors = useMemo(() => flattenErrors(formMethods.formState.errors), [formMethods.formState.errors]);

  const handleNext = async () => {
    if (stepConfig.fields.length === 0) {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
      return;
    }
    const isValid = await formMethods.trigger(stepConfig.fields as any);
    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
    } else {
      toast({ title: "入力内容を確認してください", status: "error", duration: 3000, isClosable: true });
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleFetchMetadata = async () => {
    if (!lpUrl) {
      toast({ title: "LP URLを入力してください", status: "info", duration: 3000, isClosable: true });
      return;
    }
    setIsFetchingMetadata(true);
    try {
      const res = await fetch(`/api/metadata?url=${encodeURIComponent(lpUrl)}`);
      if (!res.ok) {
        throw new Error("metadata error");
      }
      const result = await res.json();
      setMetadata(result);
      toast({ title: "メタデータを取得しました", status: "success", duration: 3000, isClosable: true });
    } catch (err) {
      toast({ title: "メタデータの取得に失敗しました", status: "error", duration: 3000, isClosable: true });
    } finally {
      setIsFetchingMetadata(false);
    }
  };

  const handleFinalSubmit = async () => {
    const valid = await formMethods.trigger();
    if (!valid) {
      errorModal.onOpen();
      return;
    }
    setSubmitError(null);
    await formMethods.handleSubmit(async (values) => {
      try {
        const response = await createCampaign(values);
        await logSubmission({ campaignId: response.campaign_id, payload: values });
        clearDraft();
        toast({ title: "キャンペーンを登録しました", status: "success", duration: 4000, isClosable: true });
        router.push({
          pathname: "/campaign/success",
          query: { id: response.campaign_id, brand: values.brand_name }
        });
      } catch (err: any) {
        console.error(err);
        setSubmitError(err?.message ?? "登録に失敗しました");
        toast({ title: "送信に失敗しました", description: err?.message, status: "error", duration: 5000, isClosable: true });
      }
    })();
  };

  const isFinalStep = currentStep === totalSteps - 1;

  const visibleFields = useMemo(() => {
    if (stepConfig.id === "legal" && !statClaim) {
      return stepConfig.fields.filter((field) => !["stat_evidence_url", "stat_note"].includes(field));
    }
    return stepConfig.fields;
  }, [statClaim, stepConfig]);

  const footerActions = (
    <HStack spacing={3} justify="flex-end">
      {currentStep > 0 ? (
        <Button variant="ghost" onClick={handleBack} type="button">
          戻る
        </Button>
      ) : null}
      <Button variant="ghost" onClick={saveDraft} type="button">
        下書きを保存
      </Button>
      {stepConfig.id === "basic" ? (
        <Button
          leftIcon={<Icon as={RepeatIcon} />}
          variant="outline"
          onClick={handleFetchMetadata}
          isLoading={isFetchingMetadata}
          type="button"
        >
          LPメタデータ取得
        </Button>
      ) : null}
      {!isFinalStep ? (
        <Button colorScheme="blue" onClick={handleNext} type="button">
          次へ進む
        </Button>
      ) : (
        <Button colorScheme="blue" onClick={handleFinalSubmit} type="button">
          この内容で送信
        </Button>
      )}
    </HStack>
  );

  return (
    <FormProvider {...formMethods}>
      <WizardLayout
        title={stepConfig.title}
        description={stepConfig.description}
        step={currentStep}
        totalSteps={totalSteps}
        sidePanel={<PreviewPanel values={formMethods.watch()} metadata={metadata} />}
      >
        <Stack spacing={6} as="form">
          {visibleFields.map((field) => (
            <FormField key={field} name={field} />
          ))}

          {stepConfig.id === "confirm" ? (
            <Stack spacing={4}>
              <Alert status="info" borderRadius="md">
                <AlertIcon />
                <AlertDescription>
                  送信後にキャンペーンIDとステータス確認リンクが表示されます。続けてレンダー依頼フォームにも遷移できます。
                </AlertDescription>
              </Alert>
              <Divider />
              <Box>
                <Text fontWeight="bold" mb={2}>
                  入力内容ダイジェスト
                </Text>
                <List spacing={2} fontSize="sm" color="gray.600">
                  <ListItem>ブランド: {formMethods.watch("brand_name")}</ListItem>
                  <ListItem>目的: {formMethods.watch("objective")}</ListItem>
                  <ListItem>主要課題: {formMethods.watch("pain_points")?.join(", ") || "-"}</ListItem>
                  <ListItem>価値提案: {formMethods.watch("value_props")?.join(", ") || "-"}</ListItem>
                  <ListItem>CTA: {formMethods.watch("cta_type")}</ListItem>
                </List>
              </Box>
              {submitError ? (
                <Alert status="error" borderRadius="md">
                  <AlertIcon />
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              ) : null}
            </Stack>
          ) : null}

          {footerActions}
        </Stack>
      </WizardLayout>

      <Modal isOpen={errorModal.isOpen} onClose={errorModal.onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>エラーの確認</ModalHeader>
          <ModalBody>
            <Text mb={3}>以下の項目を修正してください。</Text>
            <List spacing={2} styleType="disc" pl={4}>
              {summaryErrors.map((message) => (
                <ListItem key={message}>{message}</ListItem>
              ))}
            </List>
          </ModalBody>
          <ModalFooter>
            <Button onClick={errorModal.onClose} colorScheme="blue">
              閉じる
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </FormProvider>
  );
}
