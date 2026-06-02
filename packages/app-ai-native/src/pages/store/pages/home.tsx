import TopNav from "../components/top-nav"
import HeroSearch from "../components/hero-search"
import StatsDashboard from "../components/stats-dashboard"
import TypeTabs from "../components/type-tabs"
import FeaturedCarousel from "../components/featured-carousel"
import CategoryGrid from "../components/category-grid"

export default function Home() {
  return (
    <>
      <TopNav />
      <div class="mx-auto max-w-7xl">
        <HeroSearch />
        <StatsDashboard />
        <TypeTabs />
        <FeaturedCarousel />
        <CategoryGrid />
      </div>
    </>
  )
}
