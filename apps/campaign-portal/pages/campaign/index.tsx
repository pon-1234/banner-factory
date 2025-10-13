import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Link as ChakraLink,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr
} from "@chakra-ui/react";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { fetchCampaignList, type CampaignListItem } from "@/lib/api";

interface CampaignIndexPageProps {
  campaigns: CampaignListItem[];
  nextCursor: string | null;
}

const quickLinks = [
  { label: "キャンペーンを作成", href: "/campaign/new", description: "ブランド情報を入力してレンダーを開始します" },
  { label: "ステータス検索", href: "/campaign/status", description: "Campaign ID から進捗を直接確認します" }
];

function formatDate(timestamp?: string) {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export default function CampaignIndexPage({ campaigns, nextCursor }: CampaignIndexPageProps) {
  const hasCampaigns = campaigns.length > 0;

  return (
    <Stack minH="calc(100vh - 4rem)" align="center" justify="flex-start" p={6} bg="gray.50">
      <Box bg="white" p={{ base: 6, md: 10 }} rounded="lg" shadow="md" maxW="1080px" w="full">
        <Stack spacing={8}>
          <Stack spacing={2} textAlign="center">
            <Heading size="lg">キャンペーン管理</Heading>
            <Text color="gray.600">よく使う操作と最新のキャンペーン一覧をまとめています。</Text>
          </Stack>

          <Stack spacing={4}>
            {quickLinks.map((link) => (
              <Box key={link.href} borderWidth="1px" borderColor="gray.100" borderRadius="md" p={5} bg="gray.50">
                <Stack direction={{ base: "column", md: "row" }} align={{ base: "flex-start", md: "center" }} justify="space-between" spacing={{ base: 3, md: 6 }}>
                  <Stack spacing={1}>
                    <Heading size="md">{link.label}</Heading>
                    <Text fontSize="sm" color="gray.600">
                      {link.description}
                    </Text>
                  </Stack>
                  <Button as={Link} href={link.href} colorScheme="blue" variant="solid">
                    開く
                  </Button>
                </Stack>
              </Box>
            ))}
          </Stack>

          <Stack spacing={4}>
            <HStack justify="space-between" align="center">
              <Heading size="md">最近のキャンペーン</Heading>
              <Text fontSize="sm" color="gray.500">
                最終更新の新しい順で表示しています
              </Text>
            </HStack>

            {hasCampaigns ? (
              <Box overflowX="auto">
                <Table size="sm" variant="striped" colorScheme="gray">
                  <Thead>
                    <Tr>
                      <Th>Campaign ID</Th>
                      <Th>ブランド</Th>
                      <Th>ステータス</Th>
                      <Th>最終更新</Th>
                      <Th>操作</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {campaigns.map((campaign) => {
                      const input = (campaign.input ?? {}) as Record<string, unknown>;
                      const brand = (input.brand_name as string) ?? "-";
                      return (
                        <Tr key={campaign.campaign_id}>
                          <Td fontFamily="mono" fontSize="xs">{campaign.campaign_id}</Td>
                          <Td>{brand}</Td>
                          <Td>
                            <Badge
                              colorScheme=
                                {campaign.status === "rendering"
                                  ? "blue"
                                  : campaign.status === "delivered"
                                  ? "green"
                                  : campaign.status === "failed"
                                  ? "red"
                                  : "gray"}
                            >
                              {campaign.status ?? "pending"}
                            </Badge>
                          </Td>
                          <Td fontSize="sm" color="gray.600">
                            {formatDate(campaign.updated_at ?? campaign.created_at)}
                          </Td>
                          <Td>
                            <HStack spacing={2}>
                              <Button as={Link} href={`/campaign/${campaign.campaign_id}/progress`} size="xs" colorScheme="blue" variant="outline">
                                進捗
                              </Button>
                              <Button as={Link} href={`/campaign/${campaign.campaign_id}/gallery`} size="xs" colorScheme="purple" variant="ghost">
                                ギャラリー
                              </Button>
                              <ChakraLink
                                href={`${process.env.NEXT_PUBLIC_INGEST_API_BASE_URL ?? ""}/v1/campaigns/${campaign.campaign_id}`}
                                isExternal
                                fontSize="xs"
                                color="gray.500"
                              >
                                API
                              </ChakraLink>
                            </HStack>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </Box>
            ) : (
              <Box borderWidth="1px" borderColor="gray.100" borderRadius="lg" p={8} textAlign="center">
                <Text color="gray.600">まだキャンペーンがありません。まずは「キャンペーンを作成」から登録してください。</Text>
              </Box>
            )}

            {nextCursor ? (
              <Stack align="center" mt={4}>
                <Button as={Link} href={`/campaign?cursor=${encodeURIComponent(nextCursor)}`} variant="outline">
                  さらに読み込む
                </Button>
              </Stack>
            ) : null}
          </Stack>
        </Stack>
      </Box>
    </Stack>
  );
}

export const getServerSideProps: GetServerSideProps<CampaignIndexPageProps> = async (context) => {
  try {
    const cursor = typeof context.query.cursor === "string" ? context.query.cursor : undefined;
    const data = await fetchCampaignList({ cursor, limit: 20 });
    return {
      props: {
        campaigns: data.campaigns,
        nextCursor: data.next_cursor
      }
    };
  } catch (error) {
    console.error("failed to fetch campaign list", error);
    return {
      props: {
        campaigns: [],
        nextCursor: null
      }
    };
  }
};
