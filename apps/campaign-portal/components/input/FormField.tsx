import {
  Badge,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Icon,
  Input,
  InputGroup,
  InputRightElement,
  Link,
  Select,
  Textarea,
  Tooltip
} from "@chakra-ui/react";
import { useFormContext } from "react-hook-form";
import type { CampaignInput } from "@/lib/formSchema";
import { FieldKey, FIELD_CONFIG } from "@/lib/fieldConfig";
import { TagInputField } from "./TagInputField";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import { useMemo } from "react";
import { OBJECTIVE_OPTIONS, STYLE_CODE_OPTIONS, TONE_OPTIONS } from "@/lib/formSchema";

interface FormFieldProps {
  name: FieldKey;
  isHidden?: boolean;
}

export function FormField({ name, isHidden }: FormFieldProps) {
  const config = FIELD_CONFIG[name];
  const {
    register,
    formState: { errors },
    watch
  } = useFormContext<CampaignInput>();

  const error = errors[name];
  const value = watch(name as any);

  if (!config || isHidden) {
    return null;
  }

  const optionalBadge = config.optional ? (
    <Badge ml={2} colorScheme="gray">
      任意
    </Badge>
  ) : null;

  const registerOptions = config.optional
    ? {
        setValueAs: (value: string) => (value === "" ? undefined : value)
      }
    : undefined;

  const selectOptions = useMemo(() => {
    if (config.type !== "select") {
      return [] as Array<{ label: string; value: string; description?: string }>;
    }
    if (name === "objective") {
      return OBJECTIVE_OPTIONS.map((item) => ({ label: item, value: item }));
    }
    if (name === "tone") {
      return TONE_OPTIONS.map((item) => ({ label: item, value: item }));
    }
    if (name === "style_code") {
      return STYLE_CODE_OPTIONS.map((item) => ({ label: `${item.label}`, value: item.value }));
    }
    return config.options ?? [];
  }, [config.options, config.type, name]);

  let fieldControl: JSX.Element | null = null;

  switch (config.type) {
    case "text":
      fieldControl = <Input id={name} placeholder={config.placeholder} {...register(name, registerOptions)} />;
      break;
    case "textarea":
      fieldControl = (
        <Textarea id={name} placeholder={config.placeholder} minHeight="140px" {...register(name, registerOptions)} />
      );
      break;
    case "select": {
      fieldControl = (
        <Select id={name} placeholder="選択してください" {...register(name, registerOptions)}>
          {selectOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      );
      break;
    }
    case "url":
      fieldControl = (
        <InputGroup>
          <Input id={name} placeholder={config.placeholder} {...register(name, registerOptions)} />
          {value ? (
            <InputRightElement width="4.5rem">
              <Link href={value as string} isExternal color="blue.500">
                <HStack spacing={1}>
                  <Icon as={ExternalLinkIcon} />
                  <span>開く</span>
                </HStack>
              </Link>
            </InputRightElement>
          ) : null}
        </InputGroup>
      );
      break;
    case "color":
      fieldControl = <Input id={name} type="color" {...register(name, registerOptions)} />;
      break;
    case "tag":
      fieldControl = (
        <TagInputField
          id={name}
          name={name}
          config={config}
          isUrl={name.endsWith("_banners") || name.endsWith("_refs")}
        />
      );
      break;
    default:
      fieldControl = <Input id={name} placeholder={config.placeholder} {...register(name, registerOptions)} />;
  }

  return (
    <FormControl isInvalid={Boolean(error)} isRequired={!config.optional} mb={6}>
      <HStack spacing={2} align="center">
        <FormLabel htmlFor={name}>{config.label}</FormLabel>
        {optionalBadge}
        {config.tooltip ? <Tooltip label={config.tooltip}>ℹ️</Tooltip> : null}
      </HStack>
      {fieldControl}
      {config.helperText ? <FormHelperText>{config.helperText}</FormHelperText> : null}
      {error ? <FormErrorMessage>{error.message as string}</FormErrorMessage> : null}
    </FormControl>
  );
}
