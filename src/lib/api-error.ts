interface ApiLikeError {
  response?: {
    data?: {
      message?: string;
      errors?: Record<string, string[] | string>;
    };
  };
  message?: string;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as ApiLikeError;
    const errorsObj = maybeError.response?.data?.errors;

    if (errorsObj && typeof errorsObj === 'object') {
      const firstKey = Object.keys(errorsObj)[0];
      if (firstKey) {
        const val = errorsObj[firstKey];
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string' && val[0].trim()) {
          return val[0];
        }
        if (typeof val === 'string' && val.trim()) {
          return val;
        }
      }
    }

    const apiMessage = maybeError.response?.data?.message;
    if (typeof apiMessage === 'string' && apiMessage.trim() && apiMessage !== 'The given data was invalid.') {
      return apiMessage;
    }

    if (typeof maybeError.message === 'string' && maybeError.message.trim()) {
      return maybeError.message;
    }
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallback;
}
