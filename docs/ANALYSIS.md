# Analysis: how good was the day-ahead wind forecast in January 2026?

Backtest of 31 day-ahead decisions (delivery 2 Jan – 1 Feb 2026, 744 delivery hours). Unless stated otherwise, the decision time is the EPEX gate closure at 09:20 UK on D-1, which uses the 07:30 forecast run (16.5–39.5 h ahead).

## Headline accuracy

| Metric | Elexon forecast | Calibrated |
|---|---|---|
| MAE | 2.04 GW | 1.22 GW |
| RMSE | 2.50 GW | — |
| Bias (actual − forecast) | −1.75 GW | −0.12 GW |
| nMAE (MAE ÷ mean actual 11.3 GW) | 18.1% | 10.8% |
| P90 absolute error | 4.10 GW | — |
| Worst hourly shortfall | 6.87 GW (12 Jan) | — |
| P10–P90 range coverage | — | 79.3% (target 80%), average width 4.5 GW |

N2EX gate (09:50, uses the 09:30 run, 14.5–37.5 h ahead): MAE 2.01 GW, calibrated 1.21 GW.

## Findings

1. **Systematic over-forecast.** Mean forecast was 13.0 GW against mean actual 11.3 GW. Wind fell short of the forecast in **85% of hours**. A buyer who trusted the raw forecast would have been structurally short and exposed to imbalance prices.
2. **The miss scales with wind level.** Mean error by forecast level:

   | Forecast | Bias |
   |---|---|
   | ≤ 5 GW | −0.5 GW |
   | 5–10 GW | −0.8 GW |
   | 10–15 GW | −1.6 GW |
   | 15–20 GW | −2.4 GW |
   | > 20 GW | −4.6 GW |

   This is consistent with transmission constraints and curtailment on windy days. Metered output (FUELHH) is after curtailment, while the forecast reflects available wind. On 12 Jan even runs published *after* the gate were about 5 GW too high, which suggests the gap was not weather uncertainty.
3. **A wind-level-aware correction helps a lot and is safe.** Because the miss grows with wind level, the correction is a straight line fitted to actual vs forecast over the previous 14 settled days, capped so it never exceeds Elexon's forecast. It cuts MAE by 40% (2.04 → 1.22 GW) and removes nearly all the bias. It only uses data available at decision time, so the gain is achievable in practice.

   Out-of-sample comparison of correction methods (EPEX 09:20, same 14-day window):

   | Method | MAE | Days worse than Elexon | Range width at ~80% coverage |
   |---|---|---|---|
   | Raw Elexon | 2.04 GW | — | — |
   | Single scale factor (Σactual/Σforecast) | 1.32 GW | 5 | 5.5 GW |
   | Straight line, uncapped | 1.26 GW | 7 | 4.7 GW |
   | **Straight line, capped at Elexon (used)** | **1.22 GW** | **5** | **4.5 GW** |

   No method beats Elexon on every day: on calm days with no over-forecast (e.g. 14 Jan) any correction overshoots. The chosen method wins on 26 of 31 days.
4. **The range is reliable and tighter.** 79% of outcomes fell inside the P10–P90 range, close to the 80% target, with an average width of 4.5 GW (5.5 GW with the old scale-factor method). A trader can treat the P10 line as a 1-in-10-hour low-wind case.
5. **Horizon matters, but timing options are limited.** MAE rises from 1.66 GW (0–6 h ahead) to 2.33 GW (42–48 h). Deciding late on D-1 (after the 22:30 run) would give 1.82 GW, but both GB day-ahead auctions close by 09:50. Among realistic options, N2EX 09:50 is slightly better than EPEX 09:20 because the 09:30 run is available. Note the 07:30 run was slightly *worse* than the 04:30 run this month (2.04 vs 2.02 GW), which shows new runs are not always better.
6. **Early-morning delivery hours are hardest.** Lead time grows through the delivery day, from about 17 h at 00:00 to about 40 h at 23:00 UK. Even so, hourly MAE peaks for 03:00–07:00 (about 2.4 GW), not for the late hours. The wind regime matters as much as the horizon.

## Caveats

- One month of winter data. Seasonality and curtailment patterns vary, so re-run monthly.
- FUELHH wind covers BM-metered (mostly transmission-connected) wind and excludes embedded generation. The comparison is like-for-like only to the extent WINDFOR uses the same scope.
- Hourly values average the two half-hours, and daily energy sums hourly MW.
