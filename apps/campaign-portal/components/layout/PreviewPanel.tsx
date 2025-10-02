import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Divider,
  Heading,
  HStack,
  Image,
  Stack,
  Text,
  Wrap,
  WrapItem
} from "@chakra-ui/react";
import type { TemplateCode } from "@banner/shared/dist/types";
import { buildCopy } from "@banner/shared/dist/copy";
import type { CampaignInput } from "@/lib/formSchema";
import { STYLE_CODE_OPTIONS } from "@/lib/formSchema";

interface PreviewPanelProps {
  values: CampaignInput;
  metadata?: { title?: string; description?: string; ogImage?: string };
}

export function PreviewPanel({ values, metadata }: PreviewPanelProps) {
  const styleDescription = STYLE_CODE_OPTIONS.find((item) => item.value === values.style_code)?.description;
  const canPreviewCopy = Boolean(
    values.brand_name &&
      values.cta_type &&
      (values.pain_points?.length ?? 0) > 0 &&
      (values.value_props?.length ?? 0) > 0
  );
  const templateCandidates: TemplateCode[] =
    values.style_code && values.style_code !== "AUTO"
      ? [values.style_code as TemplateCode]
      : (["T1", "T2", "T3"] as TemplateCode[]);
  const copyPreviews = canPreviewCopy
    ? templateCandidates.map((template) => ({
        template,
        copy: buildCopy(values, template)
      }))
    : [];
  return (
    <Stack spacing={6}>
      <Alert status="info" borderRadius="md">
        <AlertIcon />
        <AlertDescription fontSize="sm">
          入力したコピー文言は画像内に直接レンダリングされます。文字数オーバーが無いか下部プレビューをご確認ください。
        </AlertDescription>
      </Alert>
      <Box>
        <Heading size="md" mb={3}>
          ライブプレビュー
        </Heading>
        <Box borderWidth="1px" borderColor="gray.100" rounded="lg" overflow="hidden">
          <Box bg={values.brand_color_hex ?? "#1A202C"} color="white" p={4}>
            <Text fontWeight="bold" fontSize="lg">
              {values.brand_name || "Brand"}
            </Text>
            <Text>{values.cta_type || "CTA"}</Text>
          </Box>
          <Box p={4} bg="gray.50">
            <Text fontSize="sm" color="gray.600">
              {values.pain_points?.join(" / ") || "課題タグがここに表示されます"}
            </Text>
            <Divider my={3} />
            <Text fontSize="md" fontWeight="bold">
              {values.value_props?.[0] || "価値訴求がここに表示されます"}
            </Text>
            <Text fontSize="sm" color="gray.600" mt={2}>
              {values.target_note || "ターゲットメモが設定されると要約として表示されます"}
            </Text>
          </Box>
        </Box>
      </Box>

      <Box>
        <Heading size="sm" mb={2}>
          テンプレート選定
        </Heading>
        <Text fontSize="sm" color="gray.600">
          {styleDescription ?? "スタイルは自動で選定されます"}
        </Text>
      </Box>

      <Box>
        <Heading size="sm" mb={2}>
          コピー生成プレビュー
        </Heading>
        {canPreviewCopy ? (
          <Stack spacing={3}>
            {values.style_code === "AUTO" ? (
              <Text fontSize="xs" color="gray.500">
                AUTO指定の場合はテンプレートごとに最適なコピーが生成されます（以下は想定例です）。
              </Text>
            ) : null}
            {copyPreviews.map(({ template, copy }) => (
              <Box key={template} borderWidth="1px" borderColor="gray.100" borderRadius="md" p={4} bg="white">
                <HStack justify="space-between" mb={2}>
                  <Badge colorScheme="purple">{template}</Badge>
                  <Text fontSize="xs" color="gray.500">
                    画像内テキスト想定
                  </Text>
                </HStack>
                <Stack spacing={2} fontSize="sm">
                  <Text fontWeight="bold">{copy.headline}</Text>
                  {copy.sub ? <Text color="gray.600">{copy.sub}</Text> : null}
                  {copy.badges?.length ? (
                    <Wrap spacing={2} shouldWrapChildren>
                      {copy.badges.map((badge) => (
                        <WrapItem key={badge}>
                          <Badge colorScheme="orange" variant="subtle">
                            {badge}
                          </Badge>
                        </WrapItem>
                      ))}
                    </Wrap>
                  ) : null}
                  <Text color="orange.600" fontWeight="semibold">
                    CTA: {copy.cta}
                  </Text>
                  {copy.disclaimer ? (
                    <Text fontSize="xs" color="gray.500">
                      {copy.disclaimer}
                    </Text>
                  ) : null}
                  {copy.stat_note ? (
                    <Text fontSize="xs" color="gray.500">
                      {copy.stat_note}
                    </Text>
                  ) : null}
                </Stack>
              </Box>
            ))}
          </Stack>
        ) : (
          <Text fontSize="sm" color="gray.500">
            ブランド名・課題・価値提案・CTAを入力するとコピーの自動生成プレビューが表示されます。
          </Text>
        )}
      </Box>

      <Box>
        <Heading size="sm" mb={2}>
          LPメタデータ
        </Heading>
        {metadata?.title || metadata?.ogImage || metadata?.description ? (
          <Stack spacing={3}>
            {metadata?.title ? (
              <Text fontWeight="medium">{metadata.title}</Text>
            ) : null}
            {metadata?.description ? <Text fontSize="sm">{metadata.description}</Text> : null}
            {metadata?.ogImage ? (
              <Image src={metadata.ogImage} alt="OG image" borderRadius="md" />
            ) : null}
          </Stack>
        ) : (
          <Text fontSize="sm" color="gray.500">
            LP URLを入力し、メタデータを取得するとタイトルやOG画像が表示されます。
          </Text>
        )}
      </Box>

      <Box>
        <Heading size="sm" mb={2}>
          申請者メモ
        </Heading>
        <Alert status="info" borderRadius="md">
          <AlertIcon />
          <AlertDescription fontSize="sm">
            社員SSOでログインした状態のみ送信可能です。送信内容は監査ログに記録されます。
          </AlertDescription>
        </Alert>
      </Box>

      <Box>
        <Heading size="sm" mb={2}>
          ステータス
        </Heading>
        <HStack>
          <Badge colorScheme="green">SSO</Badge>
          <Text fontSize="sm" color="gray.600">
            Google Workspace アカウントで認証されています。
          </Text>
        </HStack>
      </Box>
    </Stack>
  );
}
