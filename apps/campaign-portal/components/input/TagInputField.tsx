import {
  Box,
  HStack,
  IconButton,
  Input,
  Tag,
  TagCloseButton,
  TagLabel,
  Text,
  Tooltip,
  Wrap,
  WrapItem,
  useToast
} from "@chakra-ui/react";
import { AddIcon } from "@chakra-ui/icons";
import { useController, useFormContext } from "react-hook-form";
import { useCallback, useMemo, useState } from "react";
import type { CampaignInput } from "@/lib/formSchema";
import type { FieldConfig } from "@/lib/fieldConfig";
import { FORBIDDEN_PRESETS, MAX_ITEMS } from "@/lib/formSchema";

interface TagInputFieldProps {
  id: string;
  name: keyof CampaignInput;
  config: FieldConfig;
  isUrl?: boolean;
}

const URL_REGEX = /^https?:\/\/.+/i;

export function TagInputField({ id, name, config, isUrl }: TagInputFieldProps) {
  const { control } = useFormContext<CampaignInput>();
  const {
    field: { value = [], onChange, ref },
    fieldState: { error }
  } = useController<CampaignInput, typeof name>({ name, control });
  const [inputValue, setInputValue] = useState("");
  const toast = useToast();
  const maxItems = MAX_ITEMS[name as keyof typeof MAX_ITEMS] ?? 5;

  const suggestions = useMemo(() => {
    if (name !== "forbidden_phrases") {
      return [] as string[];
    }
    return FORBIDDEN_PRESETS;
  }, [name]);

  const addValue = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        return;
      }
      if ((value as string[]).includes(trimmed)) {
        setInputValue("");
        return;
      }
      if (value && (value as string[]).length >= maxItems) {
        toast({ title: `${config.label}は最大${maxItems}件までです`, status: "warning", duration: 3000, isClosable: true });
        return;
      }
      if (isUrl && !URL_REGEX.test(trimmed)) {
        toast({ title: "URL形式で入力してください", status: "error", duration: 3000, isClosable: true });
        return;
      }
      onChange([...(value as string[]), trimmed]);
      setInputValue("");
    },
    [config.label, isUrl, maxItems, onChange, toast, value]
  );

  const removeValue = useCallback(
    (item: string) => {
      onChange((value as string[]).filter((v) => v !== item));
    },
    [onChange, value]
  );

  return (
    <Box>
      <HStack align="flex-start">
        <Input
          id={id}
          ref={ref}
          value={inputValue}
          placeholder={config.placeholder}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addValue(inputValue);
            }
          }}
          aria-invalid={Boolean(error)}
        />
        <IconButton
          aria-label="add-value"
          icon={<AddIcon boxSize={3} />}
          onClick={() => addValue(inputValue)}
          variant="outline"
        />
      </HStack>
      <Wrap mt={2} spacing={2}>
        {(value as string[]).map((item) => (
          <WrapItem key={item}>
            <Tag borderRadius="full" colorScheme="blue">
              <TagLabel>{item}</TagLabel>
              <TagCloseButton onClick={() => removeValue(item)} />
            </Tag>
          </WrapItem>
        ))}
      </Wrap>
      <HStack justify="space-between" mt={1}>
        <Text fontSize="sm" color="gray.500">
          {(value as string[]).length}/{maxItems}
        </Text>
        {suggestions.length > 0 && (
          <HStack spacing={1}>
            {suggestions.map((item) => (
              <Tooltip label="クリックして追加" key={item}>
                <Tag
                  size="sm"
                  borderRadius="full"
                  variant="subtle"
                  colorScheme="purple"
                  onClick={() => addValue(item)}
                  cursor="pointer"
                >
                  {item}
                </Tag>
              </Tooltip>
            ))}
          </HStack>
        )}
      </HStack>
      {error ? (
        <Text fontSize="sm" color="red.500" mt={1}>
          {error.message}
        </Text>
      ) : null}
    </Box>
  );
}
