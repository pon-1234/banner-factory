export default function IndexPage() {
  return null;
}

export function getServerSideProps() {
  return {
    redirect: {
      destination: "/campaign/new",
      permanent: false
    }
  };
}
