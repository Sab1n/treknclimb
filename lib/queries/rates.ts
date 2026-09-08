import { connectDB } from '../db';
import ExchangeRate, { IExchangeRate } from '../../models/ExchangeRate';

/**
 * Active display-currency rates.
 *
 * Prices are stored and statically rendered in USD; conversion happens
 * client-side from a functional cookie, using these rates passed down as props.
 * That means the rates a visitor converts with are baked into the static HTML
 * and are only as fresh as the page's last revalidation — consistent with the
 * 7-day staleness warning in the admin.
 *
 * `rate` is units of that currency per 1 USD, so a display price is
 * `usdPrice * rate`.
 */
export async function getActiveExchangeRates(): Promise<IExchangeRate[]> {
  await connectDB();

  return ExchangeRate.find({ isActive: true })
    .sort({ currencyCode: 1 })
    .lean<IExchangeRate[]>()
    .exec();
}
