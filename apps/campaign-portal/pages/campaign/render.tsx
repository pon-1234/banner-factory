import {
  Box,
  Button,
  Checkbox,
  CheckboxGroup,
  Divider,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Select,
  Stack,
  Text,
  useToast
} from "@chakra-ui/react";
import Link from "next/link";
import { useState } from "react";
import { RenderRequestSchema } from "@banner/shared/src/types";

const renderRequestDefaults = {
  templates: ["T1"],
  sizes: ["1080x1080"],
  count_per_template: 1,
  bg_mode: "generate"
};

export default function RenderRequestPage() {
  const toast = useToast();
  const [formState, setFormState] = useState(renderRequestDefaults);

  const handleSubmit = () => {
    const payload = {
      campaign_id: "",
      inputs: [],
      ...formState
    } as unknown;
    const result = RenderRequestSchema.safeParse(payload);
    if (!result.success) {
      toast({ title: "RenderRequestSchemaに適合するように設定してください", status: "error", duration: 3000, isClosable: true });
      return;
    }
    toast({ title: "RenderRequestの事前チェックが完了しました", status: "success", duration: 3000, isClosable: true });
  };

  return (
    <Stack minH="100vh" align="center" justify="center" p={6} bg="gray.50">
      <Box bg="white" p={10} rounded="lg" shadow="md" maxW="640px" w="full">
        <Heading size="lg" mb={4}>
          レンダー依頼フォーム (ベータ)
        </Heading>
        <Text color="gray.600" mb={6}>
          Campaign IDに紐づけてテンプレートとサイズを指定し、ワークフローを手動で起動します。正式版では自動でRenderRequestSchemaに沿ったリクエストを送信します。
        </Text>

        <Stack spacing={4}>
          <FormControl>
            <FormLabel>テンプレート</FormLabel>
            <Select
              multiple
              value={formState.templates}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, templates: Array.from(event.target.selectedOptions).map((opt) => opt.value) }))
              }
            >
              <option value="T1">T1</option>
              <option value="T2">T2</option>
              <option value="T3">T3</option>
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel>サイズ</FormLabel>
            <CheckboxGroup value={formState.sizes} onChange={(value) => setFormState((prev) => ({ ...prev, sizes: value as string[] }))}>
              <Stack direction="row" spacing={4}>
                <Checkbox value="1080x1080">1080x1080</Checkbox>
                <Checkbox value="1080x1350">1080x1350</Checkbox>
                <Checkbox value="1200x628">1200x628</Checkbox>
                <Checkbox value="1080x1920">1080x1920</Checkbox>
              </Stack>
            </CheckboxGroup>
          </FormControl>
          <FormControl>
            <FormLabel>テンプレートあたりのバリエーション数</FormLabel>
            <Input
              type="number"
              min={1}
              max={6}
              value={formState.count_per_template}
              onChange={(event) => setFormState((prev) => ({ ...prev, count_per_template: Number(event.target.value) }))}
            />
          </FormControl>
        </Stack>

        <Divider my={6} />

        <Stack direction={{ base: "column", md: "row" }} spacing={4} justify="flex-end">
          <Button as={Link} href="/campaign/new" variant="ghost">
            フォームに戻る
          </Button>
          <Button colorScheme="blue" onClick={handleSubmit}>
            スキーマ検証を実行
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
