/**
 * @fileoverview Shared DOM mutation schema and validation helpers for page adaptation.
 * Dependencies: none.
 * Used by: content transformation modules and future AI planning helpers.
 */

// =============================================================================
// Constants
// =============================================================================

const MAX_MUTATIONS_PER_PLAN = 50;

const DOM_MUTATION_ACTIONS = Object.freeze({
  ADD_CLASS: 'addClass',
  INSERT_STYLE_ELEMENT: 'insertStyleElement',
  REMOVE_ATTRIBUTE: 'removeAttribute',
  REMOVE_CLASS: 'removeClass',
  SET_ATTRIBUTE: 'setAttribute',
  SET_INNER_HTML: 'setInnerHTML',
  SET_STYLE_PROPERTY: 'setStyleProperty',
  SET_TEXT_CONTENT: 'setTextContent',
  TOGGLE_CLASS: 'toggleClass',
});

// =============================================================================
// Public API
// =============================================================================

/**
 * Validates and normalizes a DOM mutation plan.
 *
 * @param {object|Array<object>} plan - The candidate mutation plan.
 * @returns {{mutations: Array<object>}} The normalized mutation plan.
 * @throws Will throw if the plan or any mutation is invalid.
 */
function validateDomMutationPlan(plan) {
  const planObject = Array.isArray(plan) ? { mutations: plan } : plan;

  if (!planObject || typeof planObject !== 'object') {
    throw new Error('DOM mutation plan must be an object or an array of mutations.');
  }

  const { mutations } = planObject;

  if (!Array.isArray(mutations) || mutations.length === 0) {
    throw new Error('DOM mutation plan must include at least one mutation.');
  }

  if (mutations.length > MAX_MUTATIONS_PER_PLAN) {
    throw new Error(`Too many DOM mutations requested: ${mutations.length}.`);
  }

  return {
    mutations: mutations.map((mutation, index) => validateDomMutation(mutation, index)),
  };
}

// =============================================================================
// Validation helpers
// =============================================================================

/**
 * Validates a single DOM mutation.
 *
 * @param {object} mutation - The mutation to validate.
 * @param {number} index - The mutation index in the plan.
 * @returns {object} The normalized mutation.
 * @throws Will throw if the mutation is malformed.
 */
function validateDomMutation(mutation, index) {
  if (!mutation || typeof mutation !== 'object') {
    throw new Error(`Invalid DOM mutation at index ${index}.`);
  }

  const action = requireString(mutation.action, 'action', index);

  if (!Object.values(DOM_MUTATION_ACTIONS).includes(action)) {
    throw new Error(`Unsupported DOM mutation action at index ${index}: ${action}.`);
  }

  switch (action) {
    case DOM_MUTATION_ACTIONS.ADD_CLASS:
    case DOM_MUTATION_ACTIONS.REMOVE_CLASS:
      return validateClassMutation(mutation, index, action);

    case DOM_MUTATION_ACTIONS.TOGGLE_CLASS:
      return validateToggleClassMutation(mutation, index);

    case DOM_MUTATION_ACTIONS.SET_ATTRIBUTE:
    case DOM_MUTATION_ACTIONS.REMOVE_ATTRIBUTE:
      return validateAttributeMutation(mutation, index, action);

    case DOM_MUTATION_ACTIONS.SET_TEXT_CONTENT:
    case DOM_MUTATION_ACTIONS.SET_INNER_HTML:
      return validateContentMutation(mutation, index, action);

    case DOM_MUTATION_ACTIONS.SET_STYLE_PROPERTY:
      return validateStyleMutation(mutation, index);

    case DOM_MUTATION_ACTIONS.INSERT_STYLE_ELEMENT:
      return validateStyleElementMutation(mutation, index);

    default:
      throw new Error(`Unsupported DOM mutation action at index ${index}: ${action}.`);
  }
}

/**
 * Validates class-based mutations.
 *
 * @param {object} mutation - The mutation to validate.
 * @param {number} index - The mutation index in the plan.
 * @param {string} action - The mutation action.
 * @returns {object} The normalized mutation.
 */
function validateClassMutation(mutation, index, action) {
  return {
    action,
    className: requireString(mutation.className, 'className', index),
    selector: requireString(mutation.selector, 'selector', index),
  };
}

/**
 * Validates toggle-class mutations.
 *
 * @param {object} mutation - The mutation to validate.
 * @param {number} index - The mutation index in the plan.
 * @returns {object} The normalized mutation.
 */
function validateToggleClassMutation(mutation, index) {
  const normalizedMutation = {
    action: DOM_MUTATION_ACTIONS.TOGGLE_CLASS,
    className: requireString(mutation.className, 'className', index),
    selector: requireString(mutation.selector, 'selector', index),
  };

  if (mutation.enabled !== undefined && typeof mutation.enabled !== 'boolean') {
    throw new Error(`Invalid enabled flag at index ${index}.`);
  }

  if (mutation.enabled !== undefined) {
    normalizedMutation.enabled = mutation.enabled;
  }

  return normalizedMutation;
}

/**
 * Validates attribute mutations.
 *
 * @param {object} mutation - The mutation to validate.
 * @param {number} index - The mutation index in the plan.
 * @param {string} action - The mutation action.
 * @returns {object} The normalized mutation.
 */
function validateAttributeMutation(mutation, index, action) {
  const normalizedMutation = {
    action,
    attributeName: requireString(mutation.attributeName, 'attributeName', index),
    selector: requireString(mutation.selector, 'selector', index),
  };

  if (action === DOM_MUTATION_ACTIONS.SET_ATTRIBUTE) {
    normalizedMutation.value = requireString(mutation.value, 'value', index);
  }

  return normalizedMutation;
}

/**
 * Validates text and HTML mutations.
 *
 * @param {object} mutation - The mutation to validate.
 * @param {number} index - The mutation index in the plan.
 * @param {string} action - The mutation action.
 * @returns {object} The normalized mutation.
 */
function validateContentMutation(mutation, index, action) {
  return {
    action,
    selector: requireString(mutation.selector, 'selector', index),
    value: requireString(mutation.value, 'value', index),
  };
}

/**
 * Validates inline style mutations.
 *
 * @param {object} mutation - The mutation to validate.
 * @param {number} index - The mutation index in the plan.
 * @returns {object} The normalized mutation.
 */
function validateStyleMutation(mutation, index) {
  return {
    action: DOM_MUTATION_ACTIONS.SET_STYLE_PROPERTY,
    propertyName: requireString(mutation.propertyName, 'propertyName', index),
    selector: requireString(mutation.selector, 'selector', index),
    value: requireString(mutation.value, 'value', index),
  };
}

/**
 * Validates stylesheet element mutations.
 *
 * @param {object} mutation - The mutation to validate.
 * @param {number} index - The mutation index in the plan.
 * @returns {object} The normalized mutation.
 */
function validateStyleElementMutation(mutation, index) {
  const normalizedMutation = {
    action: DOM_MUTATION_ACTIONS.INSERT_STYLE_ELEMENT,
    cssText: requireString(mutation.cssText, 'cssText', index),
    styleId: requireString(mutation.styleId, 'styleId', index),
  };

  if (mutation.targetSelector !== undefined) {
    normalizedMutation.targetSelector = requireString(mutation.targetSelector, 'targetSelector', index);
  }

  return normalizedMutation;
}

/**
 * Returns a required string value.
 *
 * @param {unknown} value - The candidate value.
 * @param {string} fieldName - The field name used in error messages.
 * @param {number} index - The mutation index in the plan.
 * @returns {string} The normalized string value.
 */
function requireString(value, fieldName, index) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${fieldName} in DOM mutation at index ${index}.`);
  }

  return value.trim();
}

export {
  DOM_MUTATION_ACTIONS,
  MAX_MUTATIONS_PER_PLAN,
  validateDomMutationPlan,
};