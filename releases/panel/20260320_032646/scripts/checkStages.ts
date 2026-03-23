import { loadDemografiaData } from "@/lib/mapa-conversion/api";

async function main() {
  const data = await loadDemografiaData("estado");
  console.log(JSON.stringify(data.map.dataset.slice(0, 3).map((entry) => ({
    key: entry.key,
    name: entry.name,
    etapas: entry.etapas_totales,
  })), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
