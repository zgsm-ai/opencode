import "./index.css"
import { Router, Route } from "@solidjs/router"
import StoreLayout from "./components/layout"
import Home from "./pages/home"
import Skills from "./pages/skills"
import Subagents from "./pages/subagents"
import Commands from "./pages/commands"
import McpServers from "./pages/mcp-servers"
import ItemDetail from "./pages/item-detail"
import Dashboard from "./pages/dashboard"

export default function App() {
  return (
    <Router root={StoreLayout}>
      <Route path="/" component={Home} />
      <Route path="/skills" component={Skills} />
      <Route path="/subagents" component={Subagents} />
      <Route path="/commands" component={Commands} />
      <Route path="/mcp-servers" component={McpServers} />
      <Route path="/items/:id" component={ItemDetail} />
      <Route path="/dashboard" component={Dashboard} />
    </Router>
  )
}
