import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  SimpleGrid,
  Stack,
  Text,
  useColorModeValue
} from "@chakra-ui/react";
import Image from "next/image";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { fetchCampaignProgress, type CampaignProgressResponse } from "@/lib/api";

interface CampaignGalleryPageProps {
  campaignId: string;
  progress: CampaignProgressResponse | null;
  error?: string;
}

interface GalleryItem {
  id: string;
  variantId: string;
  size: string;
  template: string;
  status: string;
  previewUrl: string | null;
  assetUrl: string | null;
  qcPassed: boolean;
  updatedAt: string | null;
}

function buildGallery(progress: CampaignProgressResponse): GalleryItem[] {
  const items: GalleryItem[] = [];
  progress.variants.forEach((variant) => {
    variant.renders.forEach((render) => {
      items.push({
        id: `${variant.variant_id}-${render.size}`,
        variantId: variant.variant_id,
        size: render.size,
        template: variant.template,
        status: render.status,
        previewUrl: render.preview_url ?? render.asset_url,
        assetUrl: render.asset_url,
        qcPassed: render.qc_passed,
        updatedAt: render.updated_at
      });
    });
  });
  return items;
}

function formatDate(timestamp?: string | null) {
  if (!timestamp) {
    return "-";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export default function CampaignGalleryPage({ campaignId, progress, error }: CampaignGalleryPageProps) {
  const bg = useColorModeValue("gray.50", "gray.900");
  const surface = useColorModeValue("white", "gray.800");

  if (error) {
    return (
      <Stack minH="calc(100vh - 4rem)" align="center" justify="center" p={6} bg={bg}>
        <Box maxW="640px" w="full" p={10} rounded="lg" shadow="md" bg={surface} textAlign="center">
          <Heading size="lg" mb={4}>
            ギャラリーを表示できませんでした
          </Heading>
          <Text color="gray.600" mb={6}>
            {error}
          </Text>
          <Button as={Link} href={`/campaign/${campaignId}/progress`} colorScheme="blue">
            進捗ダッシュボードに戻る
          </Button>
        </Box>
      </Stack>
    );
  }

  if (!progress) {
    return null;
  }

  const galleryItems = buildGallery(progress);
  const brandName = (progress.campaign.input as { brand_name?: string } | undefined)?.brand_name ?? "キャンペーン";

  return (
    <Stack minH="calc(100vh - 4rem)" p={{ base: 4, md: 8 }} spacing={8} bg={bg}>
      <HStack justify="space-between" flexWrap="wrap" gap={4}>
        <Stack spacing={1}>
          <Heading size="lg">{brandName} の生成ギャラリー</Heading>
          <Text color="gray.600">Campaign ID: {campaignId}</Text>
        </Stack>
        <HStack spacing={3}>
          <Button as={Link} href={`/campaign/${campaignId}/progress`} variant="outline" colorScheme="blue">
            進捗ダッシュボードへ戻る
          </Button>
          <Button as={Link} href={`/campaign/status`} colorScheme="blue" variant="ghost">
            他のキャンペーンを検索
          </Button>
        </HStack>
      </HStack>

      {galleryItems.length === 0 ? (
        <Box bg={surface} p={10} rounded="lg" shadow="sm" textAlign="center">
          <Heading size="md" mb={3}>
            表示できるレンダーがまだありません
          </Heading>
          <Text color="gray.600">
            レンダーが完了するとここにプレビューが表示されます。進捗ダッシュボードからステータスを確認してください。
          </Text>
        </Box>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={6}>
          {galleryItems.map((item) => (
            <Box key={item.id} bg={surface} rounded="lg" shadow="sm" overflow="hidden" display="flex" flexDirection="column">
              <Box position="relative" bg="gray.100" minH="220px">
                {item.previewUrl ? (
                  <Image src={item.previewUrl} alt={`${item.variantId}-${item.size}`} fill style={{ objectFit: "cover" }} sizes="(min-width: 1280px) 360px, (min-width: 768px) 50vw, 100vw" />
                ) : (
                  <Stack align="center" justify="center" h="220px" color="gray.500">
                    <Text fontSize="sm">プレビュー未生成</Text>
                  </Stack>
                )}
              </Box>
              <Box p={4} display="flex" flexDirection="column" gap={3}>
                <HStack spacing={2}>
                  <Badge colorScheme="purple">{item.template}</Badge>
                  <Badge colorScheme="pink">{item.size}</Badge>
                  <Badge colorScheme={item.qcPassed ? "green" : "blue"}>{item.status}</Badge>
                </HStack>
                <HStack justify="space-between" fontSize="sm" color="gray.500">
                  <Text>Variant: {item.variantId}</Text>
                  <Text>{formatDate(item.updatedAt)}</Text>
                </HStack>
                {item.assetUrl ? (
                  <Button as={Link} href={item.assetUrl} target="_blank" rel="noopener" size="sm" colorScheme="blue">
                    フルサイズを開く
                  </Button>
                ) : null}
              </Box>
            </Box>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}

export const getServerSideProps: GetServerSideProps<CampaignGalleryPageProps> = async (context) => {
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
