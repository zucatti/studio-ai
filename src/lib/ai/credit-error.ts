/**
 * Custom error class for credit-related errors
 */
export class CreditError extends Error {
  public readonly code: CreditErrorCode;
  public readonly provider: string;
  public readonly budgetAmount: number;
  public readonly currentSpent: number;
  public readonly estimatedCost: number;

  constructor(options: {
    code: CreditErrorCode;
    message: string;
    provider: string;
    budgetAmount: number;
    currentSpent: number;
    estimatedCost: number;
  }) {
    super(options.message);
    this.name = 'CreditError';
    this.code = options.code;
    this.provider = options.provider;
    this.budgetAmount = options.budgetAmount;
    this.currentSpent = options.currentSpent;
    this.estimatedCost = options.estimatedCost;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CreditError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      provider: this.provider,
      budgetAmount: this.budgetAmount,
      currentSpent: this.currentSpent,
      estimatedCost: this.estimatedCost,
      remainingBudget: Math.max(0, this.budgetAmount - this.currentSpent),
    };
  }
}

export type CreditErrorCode =
  | 'BUDGET_EXCEEDED'
  | 'BUDGET_WOULD_EXCEED'
  | 'NO_BUDGET_CONFIGURED'
  | 'ALLOCATION_NOT_FOUND';

/**
 * Check if an error is a CreditError
 */
export function isCreditError(error: unknown): error is CreditError {
  return error instanceof CreditError;
}

/**
 * Create a user-friendly error message for credit errors
 */
export function formatCreditError(error: CreditError): string {
  const remaining = Math.max(0, error.budgetAmount - error.currentSpent);
  const spentPercent = error.budgetAmount > 0
    ? Math.round((error.currentSpent / error.budgetAmount) * 100)
    : 0;

  const providerNames: Record<string, string> = {
    claude: 'Claude',
    fal: 'fal.ai',
    wavespeed: 'WaveSpeed',
    runway: 'Runway',
    modelslab: 'ModelsLab',
    elevenlabs: 'ElevenLabs',
    creatomate: 'Creatomate',
    global: 'Global',
  };

  const providerName = providerNames[error.provider] || error.provider;

  switch (error.code) {
    case 'BUDGET_EXCEEDED':
      return `Budget ${providerName} dépassé. Vous avez utilisé $${error.currentSpent.toFixed(2)} sur $${error.budgetAmount.toFixed(2)} (${spentPercent}%).`;

    case 'BUDGET_WOULD_EXCEED':
      return `Cette opération coûterait environ $${error.estimatedCost.toFixed(4)}, mais il vous reste seulement $${remaining.toFixed(2)} sur votre budget ${providerName}.`;

    case 'NO_BUDGET_CONFIGURED':
      return `Aucun budget configuré pour ${providerName}. Configurez un budget dans les paramètres.`;

    case 'ALLOCATION_NOT_FOUND':
      return `Allocation de crédit non trouvée pour ${providerName}.`;

    default:
      return error.message;
  }
}
