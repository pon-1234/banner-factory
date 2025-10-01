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
  Text
} from "@chakra-ui/react";
import type { CampaignInput } from "@/lib/formSchema";
import { STYLE_CODE_OPTIONS } from "@/lib/formSchema";

interface PreviewPanelProps {
  values: CampaignInput;
  metadata?: { title?: string; description?: string; ogImage?: string };
}

export function PreviewPanel({ values, metadata }: PreviewPanelProps) {
  const styleDescription = STYLE_CODE_OPTIONS.find((item) => item.value === values.style_code)?.description;
  return (
    <Stack spacing={6}>
      <Box>
        <Heading size="md" mb={3}>
          ライブプレビュー
        </Heading>
        <Box borderWidth="1px" borderColor="gray.100" rounded="lg" overflow="hidden">
          <Box bg={values.brand_color_hex} color="white" p={4}>
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
