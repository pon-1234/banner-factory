import {
  Badge,
  Box,
  Divider,
  Heading,
  HStack,
  Image,
  Link as ChakraLink,
  SimpleGrid,
  Stack,
  Stat,
  StatGroup,
  StatHelpText,
  StatLabel,
  StatNumber,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue
} from "@chakra-ui/react";
import type { GetServerSideProps } from "next";
import Link from "next/link";
import { fetchCampaignProgress, type CampaignProgressResponse } from "@/lib/api";

interface CampaignProgressPageProps {
  campaignId: string;
  progress: CampaignProgressResponse | null;
  error?: string;
}

const STATUS_COLOR_MAP: Record<string, string> = {
  queued: "gray",
  processing: "blue",
  composited: "purple",
  qc_passed: "green",
  manual_review: "orange",
  delivered: "teal",
  failed: "red"
};

function formatDate(timestamp?: string | null) {
  if (!timestamp) {
    return "-";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export default function CampaignProgressPage({ campaignId, progress, error }: CampaignProgressPageProps) {
  const bg = useColorModeValue("gray.50", "gray.900");
  const surface = useColorModeValue("white", "gray.800");
  const copyBg = useColorModeValue("gray.50", "gray.700");

  if (error) {
    return (
      <Stack minH="100vh" align="center" justify="center" p={6} bg={bg}>
        <Box maxW="640px" w="full" p={10} rounded="lg" shadow="md" bg={surface} textAlign="center">
          <Heading size="lg" mb={4}>
            進捗情報を取得できませんでした
          </Heading>
          <Text color="gray.600" mb={4}>
            {error}
          </Text>
          <ChakraLink as={Link} href="/campaign/new" color="blue.500">
            キャンペーンフォームへ戻る
          </ChakraLink>
        </Box>
      </Stack>
    );
  }

  if (!progress) {
    return null;
  }

  const brandName = (progress.campaign.input as { brand_name?: string } | undefined)?.brand_name ?? "キャンペーン";

  return (
    <Stack minH="100vh" p={{ base: 4, md: 8 }} spacing={8} bg={bg}>
      <Stack direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "flex-start", md: "center" }} spacing={4}>
        <Box>
          <Heading size="lg" mb={1}>
            {brandName} の生成状況
          </Heading>
          <Text color="gray.600">Campaign ID: {campaignId}</Text>
        </Box>
        <HStack spacing={3}>
          <ChakraLink as={Link} href="/campaign/new" color="blue.500">
            新しいキャンペーンを作成
          </ChakraLink>
          <ChakraLink
            href={`${process.env.NEXT_PUBLIC_INGEST_API_BASE_URL ?? ""}/v1/campaigns/${campaignId}`}
            isExternal
            color="blue.500"
          >
            Firestoreドキュメントを確認
          </ChakraLink>
        </HStack>
      </Stack>

      <StatGroup bg={surface} p={6} rounded="lg" shadow="sm" gap={6}>
        <Stat>
          <StatLabel>バリエーション数</StatLabel>
          <StatNumber>{progress.summary.total_variants}</StatNumber>
        </Stat>
        <Stat>
          <StatLabel>レンダー総数</StatLabel>
          <StatNumber>{progress.summary.total_renders}</StatNumber>
        </Stat>
        <Stat>
          <StatLabel>納品済み</StatLabel>
          <StatNumber>{progress.summary.delivered}</StatNumber>
          <StatHelpText>delivery-service 連携</StatHelpText>
        </Stat>
        <Stat>
          <StatLabel>QC保留</StatLabel>
          <StatNumber>{progress.summary.qc_blocked}</StatNumber>
          <StatHelpText>要手動確認</StatHelpText>
        </Stat>
      </StatGroup>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
        {progress.variants.map((variant) => (
          <Box key={variant.variant_id} bg={surface} p={6} rounded="lg" shadow="sm">
            <Stack spacing={4}>
              <HStack justify="space-between" align="flex-start">
                <Stack spacing={1}>
                  <Heading size="md">Variant {variant.variant_id}</Heading>
                  <HStack spacing={2}>
                    <Badge colorScheme="purple">{variant.template}</Badge>
                    <Badge colorScheme="pink">{variant.tone}</Badge>
                    <Badge colorScheme="gray">style: {variant.style_code}</Badge>
                  </HStack>
                </Stack>
              </HStack>

              {variant.copy ? (
                <Box bg={copyBg} p={4} rounded="md">
                  <Text fontWeight="bold" mb={2}>
                    {(variant.copy.headline as string) ?? ""}
                  </Text>
                  {variant.copy.sub ? (
                    <Text fontSize="sm" color="gray.600">
                      {variant.copy.sub as string}
                    </Text>
                  ) : null}
                  <HStack spacing={2} mt={2} wrap="wrap">
                    {(variant.copy.badges as string[] | undefined)?.map((badge) => (
                      <Badge key={badge} colorScheme="orange" variant="subtle">
                        {badge}
                      </Badge>
                    ))}
                  </HStack>
                  <Text fontSize="sm" color="orange.600" fontWeight="semibold" mt={3}>
                    CTA: {(variant.copy.cta as string) ?? ""}
                  </Text>
                </Box>
              ) : null}

              <Divider />

              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>サイズ</Th>
                    <Th>ステータス</Th>
                    <Th>プレビュー</Th>
                    <Th>更新</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {variant.renders.map((render) => (
                    <Tr key={`${variant.variant_id}-${render.size}`}>
                      <Td>{render.size}</Td>
                      <Td>
                        <Badge colorScheme={STATUS_COLOR_MAP[render.status] ?? "gray"}>{render.status}</Badge>
                      </Td>
                      <Td>
                        {render.preview_url ? (
                          <Image
                            src={render.preview_url}
                            alt={`${variant.variant_id}-${render.size}`}
                            borderRadius="md"
                            maxH="112px"
                            objectFit="cover"
                          />
                        ) : (
                          <Text fontSize="xs" color="gray.500">
                            生成待ち
                          </Text>
                        )}
                      </Td>
                      <Td fontSize="xs" color="gray.500">
                        {formatDate(render.updated_at)}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Stack>
          </Box>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

export const getServerSideProps: GetServerSideProps<CampaignProgressPageProps> = async (context) => {
  const { campaignId } = context.params ?? {};
  if (!campaignId || typeof campaignId !== "string") {
    return {
      props: {
        campaignId: "",
        progress: null,
        error: "キャンペーンIDが正しく指定されていません"
      }
    };
  }

  try {
    const progress = await fetchCampaignProgress(campaignId);
    return {
      props: {
        campaignId,
        progress
      }
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラーが発生しました";
    return {
      props: {
        campaignId,
        progress: null,
        error: message
      }
    };
  }
};
