import { Box, Button, FormControl, FormLabel, Heading, Input, Stack, Text, useToast } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { FormEvent, useCallback, useState } from "react";

export default function CampaignStatusPage() {
  const router = useRouter();
  const toast = useToast();
  const [campaignId, setCampaignId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = campaignId.trim();
      if (!trimmed) {
        toast({ title: "キャンペーンIDを入力してください", status: "info", duration: 3000, isClosable: true });
        return;
      }

      setIsSubmitting(true);
      try {
        await router.push(`/campaign/${trimmed}/progress`);
      } finally {
        setIsSubmitting(false);
      }
    },
    [campaignId, router, toast]
  );

  return (
    <Stack minH="calc(100vh - 4rem)" align="center" justify="center" p={6} bg="gray.50">
      <Box bg="white" p={{ base: 6, md: 10 }} rounded="lg" shadow="md" maxW="560px" w="full">
        <Box as="form" onSubmit={handleSubmit}>
          <Stack spacing={6}>
            <Stack spacing={2} textAlign="center">
              <Heading size="lg">キャンペーン進捗を確認</Heading>
              <Text color="gray.600">キャンペーンIDを入力すると、レンダー状況とプレビューを表示するダッシュボードへ移動します。</Text>
            </Stack>
          <FormControl>
            <FormLabel>Campaign ID</FormLabel>
            <Input
              placeholder="例: 51db58d844e0"
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}
              variant="filled"
            />
          </FormControl>
          <Button type="submit" colorScheme="blue" isLoading={isSubmitting}>
            ダッシュボードを開く
          </Button>
          <Text fontSize="sm" color="gray.500" textAlign="center">
            ※ 成功画面や Slack 通知に表示される ID をコピー&ペーストしてください。API で確認する場合は Ingest API の `/v1/campaigns/:id` をご利用いただけます。
          </Text>
          </Stack>
        </Box>
      </Box>
    </Stack>
  );
}
