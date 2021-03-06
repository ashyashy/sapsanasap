var Kiosk = require('./kiosk');

var _ = require('lodash');
var moment = require('moment');
var debug = require('debug')('analyzer');
const polyglot = require('./polyglot')();

const moreTicketsLimit = 5;

/**
 * @param {Object} data
 * @param {Object} [data.filter] Request for more results (means multiple entries, approximate cost)
 * @param {Boolean} [data.more] Request for more results (means multiple entries, approximate cost)
 * @returns {Promise}
 */
var analyze = function(data) {
    var filter = data.filter;
    var more = data.more;

    filter = _.extend({
        route: Kiosk.defaultRoute.toObject()
    }, filter);

    debug('Selecting the cheapest roundtrip with options', filter, 'segment:', data.segment);

    return Kiosk.getAll()
        .then(function(roundtrips) {
            var totalCost = filter.totalCost;
            var specificDate = filter.originatingTicket && filter.originatingTicket.date;
            var month = !_.isUndefined(filter.month) ? filter.month : (specificDate && specificDate.getMonth());
            var monthName = !_.isUndefined(month) ? moment(month + 1, 'M').format('MMMM').toLowerCase() : null;
            var monthBeyondTimespanMessage = monthName ? polyglot.t('monthBeyondTimespanMessage', {
                monthName: monthName,
                timespan: Kiosk.timespan
            }) : null;

            // Remove total cost from filter, since filter only test values for equalty.
            delete filter.totalCost;

            // Remove day of week filter if it is set to "any"
            if (filter.weekday === Kiosk.weekdays.any) {
                delete filter.weekday;
            }

            // Remove originating ticket date, if set to null, to cancel specific date filter
            if (filter.originatingTicket && filter.originatingTicket.date === null) {
                delete filter.originatingTicket.date;
            }

            var filteredRoundtrips = _.filter(roundtrips, filter);
            var result;
            var message;

            // If multiple results required, oder by cost and time and return the first five
            if (more) {
                result = _.sortBy(filteredRoundtrips, ['totalCost', 'originatingTicket.datetime']);
                result = excludeMin(result);
                var offset = data.segment * moreTicketsLimit;
                result = result.slice(offset, offset + moreTicketsLimit);
                if (result.length > 1) {
                    message = polyglot.t('moreTicketsCheapestFirst');
                } else if (result.length === 1) {
                    message = polyglot.t('lastPairOfTickets');
                // If specific date is set and asking for more tickets
                } else if (!result.length && specificDate) {
                    message = polyglot.t('onlyOneCheapestPairPerDay');
                } else {
                    // TODO Handle the situation when there should be tickets, but are not (like now, when there are no more morning trains to Moscow in October).
                    message = polyglot.t('noMoreTickets');
                }
            }
            // If price limit is specified, find tickets below price limit, and return nearest ticket by date.
            else if (totalCost) {
                var cheapEnoughRoundtrips = _.filter(filteredRoundtrips, function(roundtrip) {
                    return roundtrip.totalCost <= totalCost;
                });
                // If cheap enough roundtrips are found, select nearest by date
                if (cheapEnoughRoundtrips.length) {
                    result = _.minBy(cheapEnoughRoundtrips, 'originatingTicket.datetime');
                    // If cheap enough roundtrips are not found, simply select the cheapest roundtrip
                } else {
                    message = polyglot.t('noTicketsWithGivenPrice', {totalCost: totalCost});
                    result = _.minBy(filteredRoundtrips, 'totalCost');
                }
            // If month is set but no tickets found
            } else if (!_.isUndefined(filter.month) && !filteredRoundtrips.length) {
                if (Kiosk.isMonthWithinTimespan(month)) {
                    message = polyglot.t('noTicketsForGivenMonth', {monthName: monthName});
                } else {
                    message = monthBeyondTimespanMessage;
                }
            // If date is set but no tickets found
            } else if (specificDate && !filteredRoundtrips.length) {
                message = Kiosk.isMonthWithinTimespan(month) ? polyglot.t('noTicketsForGivenDate') : monthBeyondTimespanMessage;
            // If no special condition is specified, simply find the cheapest roundtrip.
            } else {
                result = _.minBy(filteredRoundtrips, 'totalCost');
            }

            result = result && !_.isArray(result) ? [result] : result;
            return {roundtrips: result, message: message};
        });
};

/**
 * Finds tickets with the same price or with price that is just slightly higher.
 */
var excludeMin = function(roundtrips) {
    var excludedRoundtrip = _.minBy(roundtrips, ['totalCost', 'originatingTicket.datetime']);
    _.remove(roundtrips, {_id: excludedRoundtrip._id});
    return roundtrips;
};

module.exports = {
    analyze: analyze
};
