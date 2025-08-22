import pandas as pd
import numpy as np
import re

def analyze_financial_data(records: list[dict]) -> dict:
    try:
        df = pd.DataFrame(records)

        if df.empty:
            return {"error": "Empty dataset"}

        # Clean data: replace NaNs and infs with None for safe JSON output later
        df.replace([np.nan, np.inf, -np.inf], None, inplace=True)

        insights = {}

        # Normalize column names for matching
        def normalize(col):
            return re.sub(r'[^a-zA-Z]', '', col).lower()

        normalized_cols = {normalize(col): col for col in df.columns}

        # Heuristics to detect key financial columns
        col_keywords = {
            "revenue": ["revenue", "sales", "income", "turnover"],
            "cost": ["cost", "expense", "spend", "expenditure"],
            "profit": ["profit", "netincome", "gain"],
            "loss": ["loss", "deficit", "negativeincome"],
            "tax": ["tax"],
            "debt": ["debt", "liability", "loan"],
            "cash": ["cash", "cashflow"],
            "asset": ["asset"],
            "equity": ["equity", "networth"]
        }

        matched_cols = {key: [] for key in col_keywords}

        for key, patterns in col_keywords.items():
            for norm_col, orig_col in normalized_cols.items():
                if any(p in norm_col for p in patterns):
                    matched_cols[key].append(orig_col)

        # Numeric summary
        numeric_cols = df.select_dtypes(include='number').columns
        if not numeric_cols.empty:
            insights["numeric_overview"] = (
                df[numeric_cols].describe().round(2).replace([np.nan, np.inf, -np.inf], None).to_dict()
            )

        # Helper to sum up financial values safely
        def safe_sum(cols):
            return sum(df[col].fillna(0).sum() for col in cols if col in df.columns)

        financials = {}
        for key, cols in matched_cols.items():
            if cols:
                financials[f"total_{key}"] = round(safe_sum(cols), 2)

        # Derived metrics
        revenue = financials.get("total_revenue")
        cost = financials.get("total_cost")
        profit = financials.get("total_profit")
        equity = financials.get("total_equity")
        debt = financials.get("total_debt")

        if revenue is not None and cost is not None:
            financials["gross_margin"] = round(revenue - cost, 2)
            try:
                financials["gross_margin_pct"] = round(((revenue - cost) / revenue) * 100, 2)
            except ZeroDivisionError:
                financials["gross_margin_pct"] = None

        if profit is not None and revenue is not None:
            try:
                financials["net_margin_pct"] = round((profit / revenue) * 100, 2)
            except ZeroDivisionError:
                financials["net_margin_pct"] = None

        if debt is not None and equity is not None:
            try:
                financials["debt_to_equity"] = round(debt / equity, 2)
            except ZeroDivisionError:
                financials["debt_to_equity"] = None

        insights["financials"] = financials

        # Time-based trend detection
        time_col = next((col for col in df.columns if pd.api.types.is_datetime64_any_dtype(df[col]) or "date" in col.lower()), None)
        if time_col:
            try:
                df[time_col] = pd.to_datetime(df[time_col], errors='coerce')
                time_df = df.dropna(subset=[time_col]).sort_values(time_col)
                if not time_df.empty:
                    monthly_trend = (
                        time_df.set_index(time_col)
                        .resample("M")[matched_cols["revenue"] + matched_cols["cost"]]
                        .sum()
                        .round(2)
                        .replace([np.nan, np.inf, -np.inf], None)
                    )
                    insights["monthly_trends"] = monthly_trend.reset_index().to_dict(orient="records")
            except Exception:
                pass

        return insights

    except Exception as e:
        return {"error": f"Error analyzing financial data: {str(e)}"}
