(function (window, document) {
  'use strict';

  var namespace = window.SRCalculator = window.SRCalculator || {};
  var core = namespace.core;
  namespace.internet = namespace.internet || {};
  namespace.landline = namespace.landline || {};
  namespace.router = namespace.router || {};

  function byId(id) { return document.getElementById(id); }
  function createOption(value, text) {
    var option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    return option;
  }
  function getMode() {
    var selector = byId('calculatorServiceType');
    return selector && selector.value === 'landline' ? 'landline' : 'internet';
  }
  function runInternetCalculate() {
    if (typeof window.calculatePrice === 'function') window.calculatePrice();
  }
  function currentExtras() {
    var extrasSelect = byId('landlineExtras');
    var category = byId('landlineCategory') && byId('landlineCategory').value === 'business' ? 'business' : 'residential';
    var source = category === 'business' ? namespace.commercialExtras : namespace.landlineExtras;
    if (!extrasSelect || !Array.isArray(source)) return [];
    return Array.prototype.slice.call(extrasSelect.selectedOptions || []).map(function (option) {
      return source[parseInt(option.value, 10)];
    }).filter(Boolean);
  }
  function renderLandlineResults(result) {
    var fields = {
      landlineBaseAmount: result.baseAmount,
      landlineExtrasAmount: result.extrasAmount,
      landlineCpeAmount: result.cpeAmount,
      landlineBalanceDeduction: result.balanceDeduction,
      landlineTaxAmount: result.taxAmount,
      landlineFinalAmount: result.finalAmount,
      priceWithoutTax: result.taxableAmount,
      priceWithTax: result.finalAmount
    };
    Object.keys(fields).forEach(function (id) {
      var element = byId(id);
      if (element) element.value = core.formatMoney(fields[id]);
    });
  }
  function calculateLandlineFromDom() {
    var packageSelect = byId('landlinePackage');
    var periodSelect = byId('landlinePeriod');
    var result = namespace.calculateLandline({
      category: byId('landlineCategory') && byId('landlineCategory').value,
      packageName: packageSelect && packageSelect.value,
      period: periodSelect && periodSelect.value,
      extras: currentExtras(),
      cpeAmount: core.getSelectedCpeAmount(document),
      balance: byId('balance') && byId('balance').value
    });
    renderLandlineResults(result);
    return result;
  }
  function populatePackages() {
    var category = byId('landlineCategory') && byId('landlineCategory').value === 'business' ? 'business' : 'residential';
    var packageSelect = byId('landlinePackage');
    if (!packageSelect) return;
    packageSelect.innerHTML = '';
    (namespace.landlinePackages[category] || []).forEach(function (item) {
      packageSelect.appendChild(createOption(item.name, item.name));
    });
    populatePeriods();
    populateExtras();
  }
  function populatePeriods() {
    var category = byId('landlineCategory') && byId('landlineCategory').value === 'business' ? 'business' : 'residential';
    var packageName = byId('landlinePackage') && byId('landlinePackage').value;
    var packageConfig = (namespace.landlinePackages[category] || []).find(function (item) { return item.name === packageName; });
    var periods = packageConfig && packageConfig.periods ? Object.keys(packageConfig.periods) : [];
    var periodSelect = byId('landlinePeriod');
    var periodWrap = byId('landlinePeriodWrap');
    if (!periodSelect) return;
    periodSelect.innerHTML = '';
    periods.forEach(function (period) { periodSelect.appendChild(createOption(period, period.charAt(0).toUpperCase() + period.slice(1))); });
    if (periodWrap) periodWrap.hidden = periods.length <= 1;
    calculateLandlineFromDom();
  }
  function populateExtras() {
    var category = byId('landlineCategory') && byId('landlineCategory').value === 'business' ? 'business' : 'residential';
    var extrasSelect = byId('landlineExtras');
    var source = category === 'business' ? namespace.commercialExtras : namespace.landlineExtras;
    if (!extrasSelect) return;
    extrasSelect.innerHTML = '';
    source.forEach(function (extra, index) {
      var label = extra.name + ' (' + core.formatMoney(extra.price) + ')';
      if (extra.freeMinutes) label += ' - ' + extra.freeMinutes + ' min';
      extrasSelect.appendChild(createOption(String(index), label));
    });
    calculateLandlineFromDom();
  }
  function tagInternetGroups() {
    ['products'].forEach(function (id) {
      var element = byId(id);
      if (element && !element.getAttribute('data-calculator-group')) {
        element.setAttribute('data-calculator-group', 'internet');
      }
    });
    [
      'discount1', 'discount2', 'extra30', 'extra50', 'extra100',
      'gigaTank400', 'gigaTank2000', 'gameOn400', 'op10', 'op20', 'op30', 'add1', 'add2'
    ].forEach(function (id) {
      var element = byId(id);
      var group = element && element.closest ? element.closest('.button-group') : element;
      if (group && !group.getAttribute('data-calculator-group')) {
        group.setAttribute('data-calculator-group', 'internet');
      }
    });
  }
  function setGroup(groupName, hidden) {
    Array.prototype.slice.call(document.querySelectorAll('[data-calculator-group="' + groupName + '"]')).forEach(function (element) {
      element.hidden = hidden;
    });
  }
  function applyMode() {
    var isLandline = getMode() === 'landline';
    setGroup('internet', isLandline);
    setGroup('landline', !isLandline);
    namespace.router.dispatch();
  }
  function bindRoutingEvents() {
    var cpeButtons = ['service1', 'service2', 'service3', 'service4'];
    cpeButtons.forEach(function (id) {
      var button = byId(id);
      if (button && !button.getAttribute('data-calculator-router-bound')) {
        button.setAttribute('data-calculator-router-bound', 'true');
        button.addEventListener('click', function () {
          if (getMode() === 'landline') setTimeout(namespace.router.dispatch, 0);
        });
      }
    });
    var resetButton = byId('reset1');
    if (resetButton && !resetButton.getAttribute('data-calculator-router-bound')) {
      resetButton.setAttribute('data-calculator-router-bound', 'true');
      resetButton.addEventListener('click', function () {
        setTimeout(function () {
          var selector = byId('calculatorServiceType');
          if (selector) selector.value = 'internet';
          applyMode();
        }, 0);
      });
    }
  }
  function installUi() {
    var container = byId('divv');
    var products = byId('products');
    var balance = byId('balance');
    if (!container || !products || !balance || byId('calculatorServiceType')) return;

    tagInternetGroups();

    var modeWrap = document.createElement('div');
    modeWrap.className = 'calculator-service-type';
    modeWrap.setAttribute('data-calculator-shared', 'service-type');
    modeWrap.innerHTML = '<label for="calculatorServiceType">Service Type</label><select id="calculatorServiceType" class="selectt"><option value="internet">Internet</option><option value="landline">Landline</option></select>';
    container.insertBefore(modeWrap, products);

    var landlineControls = document.createElement('div');
    landlineControls.id = 'landlineControls';
    landlineControls.hidden = true;
    landlineControls.setAttribute('data-calculator-group', 'landline');
    landlineControls.innerHTML = [
      '<select id="landlineCategory" class="selectt"><option value="residential">Residential</option><option value="business">Business</option></select>',
      '<select id="landlinePackage" class="selectt"></select>',
      '<div id="landlinePeriodWrap"><select id="landlinePeriod" class="selectt"></select></div>',
      '<label for="landlineExtras">Extras</label>',
      '<select id="landlineExtras" class="selectt" multiple size="6"></select>'
    ].join('');
    products.parentNode.insertBefore(landlineControls, products.nextSibling);

    var landlineResults = document.createElement('div');
    landlineResults.id = 'landlineResults';
    landlineResults.hidden = true;
    landlineResults.setAttribute('data-calculator-group', 'landline');
    landlineResults.innerHTML = [
      '<input class="ino" type="text" id="landlineBaseAmount" readonly placeholder="Base Amount" value="0.00">',
      '<input class="ino" type="text" id="landlineExtrasAmount" readonly placeholder="Extras Amount" value="0.00">',
      '<input class="ino" type="text" id="landlineCpeAmount" readonly placeholder="CPE Amount" value="0.00">',
      '<input class="ino" type="text" id="landlineBalanceDeduction" readonly placeholder="Balance Deduction" value="0.00">',
      '<input class="ino" type="text" id="landlineTaxAmount" readonly placeholder="Tax Amount" value="0.00">',
      '<input class="ino" type="text" id="landlineFinalAmount" readonly placeholder="Final Amount" value="0.00">'
    ].join('');
    balance.parentNode.insertBefore(landlineResults, balance.nextSibling);

    byId('calculatorServiceType').addEventListener('change', applyMode);
    byId('landlineCategory').addEventListener('change', populatePackages);
    byId('landlinePackage').addEventListener('change', populatePeriods);
    byId('landlinePeriod').addEventListener('change', namespace.router.dispatch);
    byId('landlineExtras').addEventListener('change', namespace.router.dispatch);
    balance.addEventListener('input', function () { if (getMode() === 'landline') namespace.router.dispatch(); });
    bindRoutingEvents();
    populatePackages();
    applyMode();
  }

  namespace.internet.calculate = runInternetCalculate;
  namespace.landline.calculate = calculateLandlineFromDom;
  namespace.router.getMode = getMode;
  namespace.router.dispatch = function () {
    if (getMode() === 'landline') return namespace.landline.calculate();
    return namespace.internet.calculate();
  };
  namespace.router.applyMode = applyMode;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installUi);
  else installUi();
})(window, document);
