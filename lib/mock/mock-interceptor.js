'use strict'

const { getResponseData, buildKey, addMockDispatch } = require('./mock-utils')
const {
  kDispatches,
  kDispatchKey,
  kDefaultHeaders,
  kDefaultTrailers,
  kContentLength,
  kMockDispatch
} = require('./mock-symbols')
const { InvalidArgumentError } = require('../core/errors')

/**
 * Defines the scope API for a interceptor reply
 */
class MockScope {
  constructor (mockDispatch) {
    this[kMockDispatch] = mockDispatch
  }

  /**
   * Delay a reply by a set amount in ms.
   */
  delay (waitInMs) {
    if (typeof waitInMs !== 'number' || !Number.isInteger(waitInMs) || waitInMs <= 0) {
      throw new InvalidArgumentError('waitInMs must be a valid integer > 0')
    }

    this[kMockDispatch].delay = waitInMs
    return this
  }

  /**
   * For a defined reply, never mark as consumed.
   */
  persist () {
    this[kMockDispatch].persist = true
    return this
  }

  /**
   * Allow one to define a reply for a set amount of matching requests.
   */
  times (repeatTimes) {
    if (typeof repeatTimes !== 'number' || !Number.isInteger(repeatTimes) || repeatTimes <= 0) {
      throw new InvalidArgumentError('repeatTimes must be a valid integer > 0')
    }

    this[kMockDispatch].times = repeatTimes
    return this
  }
}

/**
 * Defines an interceptor for a Mock
 */
class MockInterceptor {
  constructor (opts, mockDispatches) {
    if (typeof opts !== 'object') {
      throw new InvalidArgumentError('opts must be an object')
    }
    if (typeof opts.path === 'undefined') {
      throw new InvalidArgumentError('opts.path must be defined')
    }
    if (typeof opts.method === 'undefined') {
      opts.method = 'GET'
    }
    // See https://github.com/nodejs/undici/issues/1245
    // As per RFC 3986, clients are not supposed to send URI
    // fragments to servers when they retrieve a document,
    if (typeof opts.path === 'string') {
      // Matches https://github.com/nodejs/undici/blob/main/lib/fetch/index.js#L1811
      const parsedURL = new URL(opts.path, 'data://')
      opts.path = parsedURL.pathname + parsedURL.search
    }
    if (typeof opts.method === 'string') {
      opts.method = opts.method.toUpperCase()
    }

    this[kDispatchKey] = buildKey(opts)
    this[kDispatches] = mockDispatches
    this[kDefaultHeaders] = {}
    this[kDefaultTrailers] = {}
    this[kContentLength] = false
  }

  createMockScopeDispatchData (statusCode, data, responseOptions = {}) {
    const responseData = getResponseData(data)
    const contentLength = this[kContentLength] ? { 'content-length': responseData.length } : {}
    const headers = { ...this[kDefaultHeaders], ...contentLength, ...responseOptions.headers }
    const trailers = { ...this[kDefaultTrailers], ...responseOptions.trailers }

    return { statusCode, data, headers, trailers }
  }

  validateReplyParameters (statusCode, data, responseOptions) {
    if (typeof statusCode === 'undefined') {
      throw new InvalidArgumentError('statusCode must be defined')
    }
    if (typeof data === 'undefined') {
      throw new InvalidArgumentError('data must be defined')
    }
    if (typeof responseOptions !== 'object') {
      throw new InvalidArgumentError('responseOptions must be an object')
    }
  }

  /**
   * Mock an undici request with a defined reply.
   */
  reply (replyData) {
    // Values of reply aren't available right now as they
    // can only be available when the reply callback is invoked.
    if (typeof replyData === 'function') {
      // We'll first wrap the provided callback in another function,
      // this function will properly resolve the data from the callback
      // when invoked.
      const wrappedDefaultsCallback = (opts) => {
        // Our reply options callback contains the parameter for statusCode, data and options.
        const resolvedData = replyData(opts)

        // Check if it is in the right format
        if (typeof resolvedData !== 'object') {
          throw new InvalidArgumentError('reply options callback must return an object')
        }

        const { statusCode, data, responseOptions = {} } = resolvedData
        this.validateReplyParameters(statusCode, data, responseOptions)
        // Since the values can be obtained immediately we return them
        // from this higher order function that will be resolved later.
        return {
          ...this.createMockScopeDispatchData(statusCode, data, responseOptions)
        }
      }

      // Add usual dispatch data, but this time set the data parameter to function that will eventually provide data.
      const newMockDispatch = addMockDispatch(this[kDispatches], this[kDispatchKey], wrappedDefaultsCallback)
      return new MockScope(newMockDispatch)
    }

    // We can have either one or three parameters, if we get here,
    // we should have 2-3 parameters. So we spread the arguments of
    // this function to obtain the parameters, since replyData will always
    // just be the statusCode.
    const [statusCode, data, responseOptions = {}] = [...arguments]
    this.validateReplyParameters(statusCode, data, responseOptions)

    // Send in-already provided data like usual
    const dispatchData = this.createMockScopeDispatchData(statusCode, data, responseOptions)
    const newMockDispatch = addMockDispatch(this[kDispatches], this[kDispatchKey], dispatchData)
    return new MockScope(newMockDispatch)
  }

  /**
   * Mock an undici request with a defined error.
   */
  replyWithError (error) {
    if (typeof error === 'undefined') {
      throw new InvalidArgumentError('error must be defined')
    }

    const newMockDispatch = addMockDispatch(this[kDispatches], this[kDispatchKey], { error })
    return new MockScope(newMockDispatch)
  }

  /**
   * Set default reply headers on the interceptor for subsequent replies
   */
  defaultReplyHeaders (headers) {
    if (typeof headers === 'undefined') {
      throw new InvalidArgumentError('headers must be defined')
    }

    this[kDefaultHeaders] = headers
    return this
  }

  /**
   * Set default reply trailers on the interceptor for subsequent replies
   */
  defaultReplyTrailers (trailers) {
    if (typeof trailers === 'undefined') {
      throw new InvalidArgumentError('trailers must be defined')
    }

    this[kDefaultTrailers] = trailers
    return this
  }

  /**
   * Set reply content length header for replies on the interceptor
   */
  replyContentLength () {
    this[kContentLength] = true
    return this
  }
}

module.exports.MockInterceptor = MockInterceptor
module.exports.MockScope = MockScope
