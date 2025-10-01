import { Alert, AlertDescription, AlertIcon, Box, Button, Heading, Stack, Text } from "@chakra-ui/react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo } from "react";

export default function CampaignSuccessPage() {
  const router = useRouter();
  const { id, brand } = router.query;

  const statusLink = useMemo(() => {
    if (!id) return null;
    const base = process.env.NEXT_PUBLIC_INGEST_API_BASE_URL;
    if (!base) return null;
    return `${base}/v1/campaigns/${id}`;
  }, [id]);

  return (
    <Stack minH="100vh" align="center" justify="center" p={6} bg="gray.50">
      <Box bg="white" p={10} rounded="lg" shadow="md" maxW="560px" w="full" textAlign="center">
        <Heading size="lg" mb={4}>
          キャンペーンを登録しました
        </Heading>
        <Text color="gray.600" mb={6}>
          {brand ? `${brand} のキャンペーン` : "キャンペーン"} がキューに入りました。レンダー進捗を確認し、必要であればテンプレートの詳細設定に進んでください。
        </Text>

        <Alert status="success" variant="subtle" flexDirection="column" alignItems="flex-start" borderRadius="md" mb={6}>
          <AlertIcon />
          <AlertDescription>
            <Text fontWeight="bold">Campaign ID</Text>
            <Text fontFamily="mono" fontSize="lg">{id ?? "-"}</Text>
            {statusLink ? (
              <Text mt={2}>
                <Link href={statusLink} target="_blank" rel="noopener noreferrer" style={{ color: "#3182CE" }}>
                  ステータスを確認する
                </Link>
              </Text>
            ) : (
              <Text mt={2} color="gray.500">
                ステータス確認のために NEXT_PUBLIC_INGEST_API_BASE_URL を設定してください。
              </Text>
            )}
          </AlertDescription>
        </Alert>

        <Stack direction={{ base: "column", md: "row" }} spacing={4} justify="center">
          <Button as={Link} href="/campaign/render" colorScheme="blue">
            レンダー依頼に進む
          </Button>
          <Button as={Link} href="/campaign/new" variant="ghost">
            もう一件作成する
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
