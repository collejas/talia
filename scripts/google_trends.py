#!/usr/bin/env python3
"""Consulta Google Trends y resume resultados para un conjunto de terminos."""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

try:
    from pytrends.request import TrendReq
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "pytrends no esta instalado. Instalalo con `pip install pytrends`."
    ) from exc

try:
    from pytrends.exceptions import TooManyRequestsError
except ImportError:  # pragma: no cover
    TooManyRequestsError = Exception

try:
    import pandas as pd
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "pandas no esta instalado. Instalalo con `pip install pandas`."
    ) from exc

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Descarga tendencias de Google Trends y genera CSV/grafico.",
    )
    parser.add_argument(
        "keywords",
        nargs="*",
        default=[
            "IA de WhatsApp",
            "IA para WhatsApp",
            "IA para ventas",
            "asistente de IA",
            "CRM IA",
        ],
        help="Lista de terminos a consultar. Default: ejemplos relacionados con IA.",
    )
    parser.add_argument(
        "--timeframe",
        default="today 12-m",
        help="Rango de tiempo aceptado por Google Trends. Ej: 'now 7-d', 'today 5-y'.",
    )
    parser.add_argument(
        "--geo",
        default="MX",
        help="Codigo de pais/region (ISO-3166). Usa '' para global. Default: MX.",
    )
    parser.add_argument(
        "--hl",
        default="es-MX",
        help="Codigo de idioma/region para Google Trends. Default: es-MX.",
    )
    parser.add_argument(
        "--tz",
        type=int,
        default=360,
        help="Zona horaria en minutos respecto a UTC. Default: 360 (UTC-6).",
    )
    parser.add_argument(
        "--csv",
        type=Path,
        metavar="PATH",
        help="Ruta para guardar los datos en CSV. Se sobreescribe si existe.",
    )
    parser.add_argument(
        "--plot",
        type=Path,
        metavar="PATH",
        help="Ruta para guardar un grafico PNG. Se sobreescribe si existe.",
    )
    parser.add_argument(
        "--show",
        action="store_true",
        help="Muestra el grafico en pantalla (requiere backend disponible).",
    )
    parser.add_argument(
        "--no-partial",
        action="store_true",
        help="Elimina la columna 'isPartial' del resultado si esta presente.",
    )
    parser.add_argument(
        "--by-region",
        type=Path,
        metavar="PATH",
        help="Ruta para guardar interes por region en CSV.",
    )
    parser.add_argument(
        "--region-resolution",
        default="REGION",
        choices=["COUNTRY", "REGION", "SUBREGION", "DMA", "CITY"],
        help="Nivel de detalle para interes por region. Default: REGION.",
    )
    parser.add_argument(
        "--inc-low-vol",
        action="store_true",
        help="Incluye regiones de bajo volumen en el CSV.",
    )
    parser.add_argument(
        "--inc-geo-code",
        action="store_true",
        help="Incluye codigos geograficos en el CSV.",
    )
    parser.add_argument(
        "--related-queries",
        type=Path,
        metavar="PATH",
        help="Ruta JSON para guardar consultas relacionadas por keyword.",
    )
    parser.add_argument(
        "--related-topics",
        type=Path,
        metavar="PATH",
        help="Ruta JSON para guardar topicos relacionados por keyword.",
    )
    parser.add_argument(
        "--suggestions",
        type=Path,
        metavar="PATH",
        help="Ruta JSON para guardar sugerencias de autocompletado por keyword.",
    )
    parser.add_argument(
        "--min-sleep",
        type=float,
        default=2.0,
        help="Segundos minimos de espera entre peticiones a Google (default: 2.0).",
    )
    parser.add_argument(
        "--max-sleep",
        type=float,
        default=5.0,
        help="Segundos maximos de espera entre peticiones a Google (default: 5.0). Usa 0 para desactivar.",
    )
    return parser.parse_args(argv)


def fetch_trends(
    pytrends: TrendReq, keywords: list[str], timeframe: str, geo: str
) -> pd.DataFrame:
    pytrends.build_payload(keywords, timeframe=timeframe, geo=geo)
    data = pytrends.interest_over_time()
    if data.empty:
        raise SystemExit("Google Trends no devolvio datos para la combinacion solicitada.")
    return data


def fetch_interest_by_region(
    pytrends: TrendReq,
    resolution: str,
    inc_low_vol: bool,
    inc_geo_code: bool,
) -> pd.DataFrame:
    data = pytrends.interest_by_region(
        resolution=resolution,
        inc_low_vol=inc_low_vol,
        inc_geo_code=inc_geo_code,
    )
    return data


def serialize_related_queries(raw: dict[str, dict[str, pd.DataFrame | None]]) -> dict[str, dict[str, list[dict[str, object]]]]:
    result: dict[str, dict[str, list[dict[str, object]]]] = {}
    for keyword, sections in raw.items():
        result[keyword] = {}
        for section_name, df in sections.items():
            if df is None or df.empty:
                result[keyword][section_name] = []
            else:
                result[keyword][section_name] = df.reset_index().to_dict(orient="records")
    return result


def serialize_related_topics(raw: dict[str, dict[str, pd.DataFrame | None]]) -> dict[str, dict[str, list[dict[str, object]]]]:
    result: dict[str, dict[str, list[dict[str, object]]]] = {}
    for keyword, sections in raw.items():
        result[keyword] = {}
        for section_name, df in sections.items():
            if df is None or df.empty:
                result[keyword][section_name] = []
            else:
                result[keyword][section_name] = df.reset_index().to_dict(orient="records")
    return result


def fetch_suggestions(
    pytrends: TrendReq,
    keywords: list[str],
    min_sleep: float,
    max_sleep: float,
) -> dict[str, list[dict[str, object]]]:
    suggestions: dict[str, list[dict[str, object]]] = {}
    for keyword in keywords:
        try:
            suggestions[keyword] = pytrends.suggestions(keyword=keyword)
        except Exception as exc:  # pragma: no cover
            suggestions[keyword] = [{"error": str(exc)}]
        else:
            wait_between_requests(min_sleep, max_sleep)
    return suggestions


def wait_between_requests(min_sleep: float, max_sleep: float) -> None:
    if max_sleep <= 0:
        return
    upper = max(min_sleep, max_sleep)
    lower = min(min_sleep, max_sleep)
    lower = max(0.0, lower)
    delay = random.uniform(lower, upper)
    time.sleep(delay)


def render_plot(
    data: pd.DataFrame,
    keywords: list[str],
    title: str,
    output_path: Path | None,
    show_plot: bool,
) -> None:
    try:
        import matplotlib
        if not show_plot:
            matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "No se pudo importar matplotlib. Detalle original: "
            f"{exc}. Revisa que matplotlib y pillow esten instalados correctamente."
        ) from exc

    ax = data[keywords].plot(figsize=(10, 6), title=title)
    ax.set_ylabel("Interes relativo")
    ax.set_xlabel("Fecha")
    fig = ax.get_figure()

    if output_path:
        fig.savefig(output_path, dpi=150, bbox_inches="tight")
        print(f"Grafico guardado en {output_path}")

    if show_plot:
        plt.show()
    else:
        plt.close(fig)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    pytrends = TrendReq(hl=args.hl, tz=args.tz)

    try:
        data = fetch_trends(
            pytrends=pytrends,
            keywords=args.keywords,
            timeframe=args.timeframe,
            geo=args.geo,
        )
    except TooManyRequestsError as exc:  # pragma: no cover
        print(
            "Google Trends rechazo la solicitud por exceso de peticiones (429). "
            "Prueba de nuevo en unos minutos o reduce la frecuencia de consultas."
        )
        print(f"Detalle original: {exc}")
        return 1

    wait_between_requests(args.min_sleep, args.max_sleep)

    if args.no_partial and "isPartial" in data.columns:
        data = data.drop(columns=["isPartial"])

    print("Ultimas filas de los datos:")
    print(data.tail())

    if args.csv:
        data.to_csv(args.csv, index=True)
        print(f"Datos guardados en {args.csv}")

    if args.by_region:
        wait_between_requests(args.min_sleep, args.max_sleep)
        try:
            region_df = fetch_interest_by_region(
                pytrends,
                resolution=args.region_resolution,
                inc_low_vol=args.inc_low_vol,
                inc_geo_code=args.inc_geo_code,
            )
        except TooManyRequestsError as exc:  # pragma: no cover
            print(
                "No se pudo obtener interes por region por limite de peticiones (429). "
                f"Detalle: {exc}"
            )
        except Exception as exc:  # pragma: no cover
            print(f"Error al obtener interes por region: {exc}")
        else:
            if region_df.empty:
                print("No se encontraron datos de interes por region.")
            else:
                region_df.to_csv(args.by_region)
                print(f"Interes por region guardado en {args.by_region}")

    if args.related_queries:
        wait_between_requests(args.min_sleep, args.max_sleep)
        try:
            related_raw = pytrends.related_queries()
        except Exception as exc:  # pragma: no cover
            print(f"No se pudieron obtener consultas relacionadas: {exc}")
        else:
            if related_raw:
                related = serialize_related_queries(related_raw)
                if args.related_queries.parent:
                    args.related_queries.parent.mkdir(parents=True, exist_ok=True)
                args.related_queries.write_text(json.dumps(related, ensure_ascii=False, indent=2))
                print(f"Consultas relacionadas guardadas en {args.related_queries}")
            else:
                print("Consultas relacionadas vacias.")

    if args.related_topics:
        wait_between_requests(args.min_sleep, args.max_sleep)
        try:
            topics_raw = pytrends.related_topics()
        except Exception as exc:  # pragma: no cover
            print(f"No se pudieron obtener topicos relacionados: {exc}")
        else:
            if topics_raw:
                topics = serialize_related_topics(topics_raw)
                if args.related_topics.parent:
                    args.related_topics.parent.mkdir(parents=True, exist_ok=True)
                args.related_topics.write_text(json.dumps(topics, ensure_ascii=False, indent=2))
                print(f"Topicos relacionados guardados en {args.related_topics}")
            else:
                print("Topicos relacionados vacios.")

    if args.suggestions:
        wait_between_requests(args.min_sleep, args.max_sleep)
        suggestions = fetch_suggestions(
            pytrends,
            args.keywords,
            args.min_sleep,
            args.max_sleep,
        )
        if args.suggestions.parent:
            args.suggestions.parent.mkdir(parents=True, exist_ok=True)
        args.suggestions.write_text(json.dumps(suggestions, ensure_ascii=False, indent=2))
        print(f"Sugerencias guardadas en {args.suggestions}")

    if args.plot or args.show:
        timeframe_label = args.timeframe
        geo_label = args.geo or "Global"
        title = f"Tendencias Google Trends ({geo_label}, {timeframe_label})"
        render_plot(data, args.keywords, title, args.plot, args.show)

    return 0


if __name__ == "__main__":
    sys.exit(main())
