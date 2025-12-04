import {
    type Address,
    type Cart,
    type CheckoutParams,
    type CheckoutSelectors,
    type Consignment,
    type CustomerRequestOptions,
    type FormField,
    type RequestOptions,
    type ShippingInitializeOptions,
    type ShippingRequestOptions,
} from '@bigcommerce/checkout-sdk';
import React, { useEffect } from 'react';

import { withLanguage, type WithLanguageProps } from '@bigcommerce/checkout/locale';
import { useCheckout } from '@bigcommerce/checkout/payment-integration-api';

import isUsingMultiShipping from './isUsingMultiShipping';
import MultiShippingForm, { type MultiShippingFormValues } from './MultiShippingForm';
import SingleShippingForm, { type SingleShippingFormValues } from './SingleShippingForm';
import { mtxConfig } from '../mtxConfig';

export interface ShippingFormProps {
    cart: Cart;
    cartHasChanged: boolean;
    consignments: Consignment[];
    countriesWithAutocomplete: string[];
    customerMessage: string;
    googleMapsApiKey?: string;
    isBillingSameAsShipping: boolean;
    isGuest: boolean;
    isLoading: boolean;
    isShippingStepPending: boolean;
    isMultiShippingMode: boolean;
    methodId?: string;
    shippingAddress?: Address;
    shouldShowOrderComments: boolean;
    isFloatingLabelEnabled?: boolean;
    isInitialValueLoaded: boolean;
    deinitialize(options: ShippingRequestOptions): Promise<CheckoutSelectors>;
    deleteConsignments(): Promise<Address | undefined>;
    getFields(countryCode?: string): FormField[];
    initialize(options: ShippingInitializeOptions): Promise<CheckoutSelectors>;
    onCreateAccount(): void;
    onMultiShippingSubmit(values: MultiShippingFormValues): void;
    onSignIn(): void;
    onSingleShippingSubmit(values: SingleShippingFormValues): void;
    onUnhandledError(error: Error): void;
    signOut(options?: CustomerRequestOptions): void;
    updateAddress(
        address: Partial<Address>,
        options: RequestOptions<CheckoutParams>,
    ): Promise<CheckoutSelectors>;
    shippingFormRenderTimestamp?: number;
    setIsMultishippingMode(isMultiShippingMode: boolean): void;
}

const ShippingForm = ({
    cart,
    cartHasChanged,
    consignments,
    countriesWithAutocomplete,
    customerMessage,
    deinitialize,
    deleteConsignments,
    getFields,
    googleMapsApiKey,
    initialize,
    isBillingSameAsShipping,
    isLoading,
    isMultiShippingMode,
    methodId,
    onMultiShippingSubmit,
    onSingleShippingSubmit,
    onUnhandledError,
    shippingAddress,
    shouldShowOrderComments,
    signOut,
    updateAddress,
    isShippingStepPending,
    isFloatingLabelEnabled,
    isInitialValueLoaded,
    shippingFormRenderTimestamp,
    setIsMultishippingMode,
}: ShippingFormProps & WithLanguageProps) => {
    const {
        checkoutState: {
            data: { getConfig, getCustomer },
        },
    } = useCheckout();
    const config = getConfig();

    const customer = getCustomer();
    const customerId = customer?.id;
   
    const companyNameFromGroup = customer?.customerGroup?.name;
    const companyNameFromAddress = customer?.addresses?.[0]?.company;

    const companyName =
        companyNameFromGroup ||
        companyNameFromAddress ||
        shippingAddress?.company ||
        '';

    const [companyVat, setCompanyVat] = React.useState<string>(''); // fallback iniziale

    useEffect(() => {
        if (!customerId) {
            return;
        }

        const loadCompanyVat = async () => {
            try {
                const url = `https://www.bigcommerceconnector.com/gem/getCompanyData.php?customerId=${customerId}`;

                const res = await fetch(url, {
                    credentials: 'include',
                });

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                const data = await res.json();                

                if (data.vatNumber) {
                    setCompanyVat(data.vatNumber);
                }
            } catch (error) {
                console.error('[MTX] - errore caricando P.IVA da backend', error);
            }
        };

        loadCompanyVat();
    }, [customerId]);



    useEffect(() => {
        if (shippingFormRenderTimestamp) {
            const hasMultiShippingEnabled = config?.checkoutSettings?.hasMultiShippingEnabled ?? false;
            const isMultiShippingMode =
                !!cart &&
                !!consignments &&
                hasMultiShippingEnabled &&
                isUsingMultiShipping(consignments, cart.lineItems);

            setIsMultishippingMode(isMultiShippingMode);
        }
    }, [shippingFormRenderTimestamp,]);

    useEffect(() => {
        const pIvaId = mtxConfig.AddressCustomFields.pIvaID;
        const pIvaInputId = `field_${pIvaId}Input`; // es: field_30Input

        const intervalId = window.setInterval(() => {
            // --- P.IVA ---
            const pivaInput = document.getElementById(pIvaInputId) as HTMLInputElement | null;

            if (pivaInput) {
                pivaInput.readOnly = true;

                // allinea sempre il valore alla P.IVA aziendale
                if (companyVat && pivaInput.value !== companyVat) {
                    pivaInput.value = companyVat;
                }

                pivaInput.style.backgroundColor = '#f4f4f4';
                pivaInput.style.cursor = 'not-allowed';
            }


            // --- COMPANY / AZIENDA ---
            const companyInput = document.querySelector<HTMLInputElement>(
                'input[name="shippingAddress.company"], input[name="company"]',
            );

            if (companyInput) {
                companyInput.readOnly = true;

                // allinea sempre il valore al companyName risolto dal customer
                if (companyName && companyInput.value !== companyName) {
                    companyInput.value = companyName;
                }

                companyInput.style.backgroundColor = '#f4f4f4';
                companyInput.style.cursor = 'not-allowed';
            }

            // se abbiamo settato almeno uno dei due, possiamo fermare l'intervallo
            if (pivaInput || companyInput) {
                window.clearInterval(intervalId);
            }
        }, 300);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [shippingFormRenderTimestamp, companyName, companyVat]);




    const getMultiShippingForm = () => {
        return <MultiShippingForm
            cartHasChanged={cartHasChanged}
            countriesWithAutocomplete={countriesWithAutocomplete}
            customerMessage={customerMessage}
            defaultCountryCode={shippingAddress?.countryCode}
            isLoading={isLoading}
            onSubmit={onMultiShippingSubmit}
            onUnhandledError={onUnhandledError}
        />;
    };

    const pIvaCustomFieldId = `field_${mtxConfig.AddressCustomFields.pIvaID}`;

    const patchedShippingAddress = shippingAddress
        ? {
            ...shippingAddress,

            company: companyName || shippingAddress.company,

            customFields: Array.isArray(shippingAddress.customFields)
                ? shippingAddress.customFields.map(customField => {
                    if (customField.fieldId === pIvaCustomFieldId) {
                        const patched = {
                            ...customField,
                            fieldValue: companyVat, // 👈 QUI usiamo la P.IVA vera
                        };                        

                        return patched;
                    }

                    return customField;
                })
                : shippingAddress.customFields,
        }
        : shippingAddress;



    const getFieldsWithPivaRequired = (countryCode?: string): FormField[] => {
        const fields = getFields(countryCode);
        const pIvaId = mtxConfig.AddressCustomFields.pIvaID;

        return fields.map(field => {
            const isPivaField =
                field.name === `field_${pIvaId}` ||
                field.name === `customField[${pIvaId}]` ||
                field.id === pIvaId;

            const isCompanyField =
                field.name === 'company' ||
                field.name === 'shippingAddress.company' ||
                field.id === 'company';

            if (isPivaField || isCompanyField) {
                return {
                    ...field,
                    required: false,
                };
            }

            return field;
        });
    };



    return isMultiShippingMode ? (
        getMultiShippingForm()
    ) : (
        <SingleShippingForm
            cartHasChanged={cartHasChanged}
            consignments={consignments}
            countriesWithAutocomplete={countriesWithAutocomplete}
            customerMessage={customerMessage}
            deinitialize={deinitialize}
            deleteConsignments={deleteConsignments}
            getFields={getFieldsWithPivaRequired}
            googleMapsApiKey={googleMapsApiKey}
            initialize={initialize}
            isBillingSameAsShipping={isBillingSameAsShipping}
            isFloatingLabelEnabled={isFloatingLabelEnabled}
            isInitialValueLoaded={isInitialValueLoaded}
            isLoading={isLoading}
            isMultiShippingMode={isMultiShippingMode}
            isShippingStepPending={isShippingStepPending}
            methodId={methodId}
            onSubmit={onSingleShippingSubmit}
            onUnhandledError={onUnhandledError}
            shippingAddress={patchedShippingAddress}
            shippingFormRenderTimestamp={shippingFormRenderTimestamp}
            shouldShowOrderComments={shouldShowOrderComments}
            signOut={signOut}
            updateAddress={updateAddress}
        />
    );
};

export default withLanguage(ShippingForm);
