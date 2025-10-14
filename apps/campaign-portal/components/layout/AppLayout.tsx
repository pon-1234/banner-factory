import { Box, Button, Flex, Link as ChakraLink } from "@chakra-ui/react";
import NextLink from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";

const NAV_ITEMS: Array<{ label: string; href: string }> = [
  { label: "キャンペーン一覧", href: "/campaign" },
  { label: "キャンペーン作成", href: "/campaign/new" },
  { label: "ステータス確認", href: "/campaign/status" }
];

export interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const router = useRouter();
  const basePath = router.asPath.split("?")[0];

  return (
    <Flex direction="column" minH="100vh" bg="gray.50">
      <Box as="header" bg="white" borderBottomWidth="1px" borderColor="gray.200" position="sticky" top={0} zIndex={10}>
        <Flex h={16} align="center" px={{ base: 4, md: 8 }} maxW="1280px" mx="auto" w="full" justify="space-between" gap={6}>
          <ChakraLink
            as={NextLink}
            href="/campaign/new"
            fontWeight="bold"
            fontSize="lg"
            color="blue.600"
            _hover={{ textDecoration: "none", color: "blue.700" }}
          >
            Banner Factory Portal
          </ChakraLink>
          <Flex as="nav" align="center" gap={{ base: 2, md: 4 }} flexWrap="wrap" justify="flex-end">
            {NAV_ITEMS.map((item) => {
              const isRoot = item.href === "/campaign";
              const isActive = basePath === item.href || (!isRoot && basePath.startsWith(`${item.href}/`));
              return (
                <Button
                  key={item.href}
                  as={NextLink}
                  href={item.href}
                  size="sm"
                  variant={isActive ? "solid" : "ghost"}
                  colorScheme="blue"
                >
                  {item.label}
                </Button>
              );
            })}
          </Flex>
        </Flex>
      </Box>
      <Box as="main" flex="1">
        {children}
      </Box>
    </Flex>
  );
}
