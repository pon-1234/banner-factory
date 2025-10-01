import { Box, Flex, Heading, Progress, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

interface WizardLayoutProps {
  title: string;
  description?: string;
  step: number;
  totalSteps: number;
  children: ReactNode;
  sidePanel?: ReactNode;
}

export function WizardLayout({ title, description, step, totalSteps, children, sidePanel }: WizardLayoutProps) {
  const progress = Math.round(((step + 1) / totalSteps) * 100);
  return (
    <Flex direction={{ base: "column", lg: "row" }} minH="100vh">
      <Box flex="1" p={{ base: 6, md: 10 }}>
        <Stack spacing={6} maxW="760px" mx="auto">
          <Stack spacing={3}>
            <Text fontSize="sm" color="gray.500">
              Step {step + 1} / {totalSteps}
            </Text>
            <Heading size="lg">{title}</Heading>
            {description ? <Text color="gray.600">{description}</Text> : null}
            <Progress value={progress} size="sm" borderRadius="full" colorScheme="blue" />
          </Stack>
          <Box bg="white" p={{ base: 6, md: 8 }} rounded="lg" shadow="md">
            {children}
          </Box>
        </Stack>
      </Box>
      {sidePanel ? (
        <Box
          w={{ base: "100%", lg: "420px" }}
          borderLeftWidth={{ base: 0, lg: "1px" }}
          borderTopWidth={{ base: "1px", lg: 0 }}
          borderColor="gray.100"
          bg="white"
          p={{ base: 6, md: 8 }}
        >
          {sidePanel}
        </Box>
      ) : null}
    </Flex>
  );
}
