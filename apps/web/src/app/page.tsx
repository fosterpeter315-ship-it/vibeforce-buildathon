import { SearchForm } from "@/components/SearchForm";

export default function HomePage() {
  return (
    <>
      <h1>Find the best award seats</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        Search a region or a specific set of cities across a loyalty program at once.
      </p>
      <SearchForm />
    </>
  );
}
