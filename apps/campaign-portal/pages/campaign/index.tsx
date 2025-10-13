import { Box, Button, Heading, Stack, Text } from "@chakra-ui/react";
import Link from "next/link";

const quickLinks = [
  { label: "キャンペーンを作成", href: "/campaign/new", description: "ブランド情報を入力してレンダーを開始します" },
  { label: "進捗ダッシュボードへ", href: "/campaign/status", description: "Campaign ID から生成状況を検索します" }
];

export default function CampaignIndexPage() {
  return (
    <Stack minH="calc(100vh - 4rem)" align="center" justify="center" p={6} bg="gray.50">
      <Box bg="white" p={{ base: 6, md: 10 }} rounded="lg" shadow="md" maxW="720px" w="full">
        <Stack spacing={6}>
          <Stack spacing={2} textAlign="center">
            <Heading size="lg">キャンペーン管理メニュー</Heading>
            <Text color="gray.600">よく使う画面へのショートカットから操作を開始してください。</Text>
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
        </Stack>
      </Box>
    </Stack>
  );
}
