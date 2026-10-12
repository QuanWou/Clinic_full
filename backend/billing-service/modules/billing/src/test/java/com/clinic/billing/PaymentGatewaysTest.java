package com.clinic.billing;

import com.clinic.billing.api.ApiProblem;
import com.clinic.billing.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.net.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import com.sun.net.httpserver.HttpServer;
import static org.junit.jupiter.api.Assertions.*;
import static com.clinic.billing.service.PaymentConfiguration.*;

class PaymentGatewaysTest {
 private final UUID clinic=UUID.fromString("00000000-0000-0000-0000-000000000001");private final ObjectMapper json=new ObjectMapper();
 private PaymentGateways gateway(){return new PaymentGateways(new Settings(true,clinic,"http://localhost:4176",new Payos("synthetic-client","synthetic-key","synthetic-checksum","https://api-merchant.payos.vn"),new Vnpay("TMNTEST1","synthetic-vnpay-key","https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"),new Bank("970436","Vietcombank","1234567890","NGUYEN VAN A")),json);}
 @Test void webhookVerifiesIndependentKnownVectorAndRejectsTamperedAmounts()throws Exception{
  var body=json.readTree("{\"data\":{\"amount\":100000,\"code\":\"00\",\"currency\":\"VND\",\"orderCode\":123456,\"paymentLinkId\":\"link-test\",\"reference\":\"TX-1\"},\"signature\":\"21c671208621583cbc1d93f730b7370c06038cfeb123a55064fc2afb42914223\"}");
  var gateway=gateway();assertEquals(100000,gateway.webhook(body).amountVnd());((com.fasterxml.jackson.databind.node.ObjectNode)body.path("data")).put("amount",100001);assertThrows(ApiProblem.class,()->gateway.webhook(body));
 }
 @Test void unconfiguredGatewaysAndAnotherClinicNeverExposePaymentChoices(){
  assertTrue(gateway().methods(clinic).getFirst().available());assertFalse(gateway().methods(UUID.randomUUID()).getFirst().available());assertThrows(ApiProblem.class,()->gateway().require(UUID.randomUUID(),"VNPAY"));
  var disabled=new PaymentGateways(new Settings(false,clinic,"http://localhost:4176",new Payos("","","","https://api-merchant.payos.vn"),new Vnpay("","","https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"),new Bank("970436","VCB","1234567890","")),json);
  assertEquals(1,disabled.methods(clinic).stream().filter(PaymentGateways.Method::available).count());assertTrue(disabled.methods(clinic).getLast().available());
 }
 @Test void removedVnpayCannotBeChosenEvenWithOldCredentials(){
  var gateway=gateway();assertFalse(gateway.methods(clinic).stream().anyMatch(m->m.code().equals("VNPAY")));
  assertThrows(ApiProblem.class,()->gateway.create(clinic,UUID.randomUUID(),UUID.randomUUID(),"VNPAY","invoice123",180000,Instant.now().plusSeconds(900),"192.0.2.1"));
 }
 @Test void payosCreatesASignedNineCharacterDescriptionAndReturnsToTheInvoicePage()throws Exception{
  var captured=new AtomicReference<com.fasterxml.jackson.databind.JsonNode>();
  var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
  server.createContext("/v2/payment-requests",exchange->{
   captured.set(json.readTree(exchange.getRequestBody()));
   byte[] response=("{\"code\":\"00\",\"data\":{\"amount\":100000,\"checkoutUrl\":\"https://pay.payos.vn/web/synthetic-link\",\"currency\":\"VND\",\"description\":\"PK9012345\",\"orderCode\":123456789012345,\"paymentLinkId\":\"synthetic-link\",\"qrCode\":\"synthetic-qr\",\"status\":\"PENDING\"},\"signature\":\"11cdbcd4b9ac2729536aac37b58d292ba3f055674af32364d2b60bb4da3dc830\"}").getBytes(java.nio.charset.StandardCharsets.UTF_8);
   exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(200,response.length);exchange.getResponseBody().write(response);exchange.close();
  });
  server.start();
  try{
   var gateway=new PaymentGateways(new Settings(true,clinic,"http://localhost:4176",new Payos("synthetic-client","synthetic-key","synthetic-checksum","http://127.0.0.1:"+server.getAddress().getPort()),new Vnpay("","","https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"),new Bank("","","","")),json);
   var branch=UUID.fromString("00000000-0000-0000-0000-000000000002");var intent=UUID.fromString("00000000-0000-0000-0000-000000000003");
   var link=gateway.create(clinic,branch,intent,"PAYOS","123456789012345",100000,Instant.now().plusSeconds(900),"127.0.0.1");
   assertEquals("https://pay.payos.vn/web/synthetic-link",link.checkoutUrl());assertEquals("synthetic-qr",link.qrCode());
   var request=captured.get();assertNotNull(request);assertEquals("PK9012345",request.path("description").asText());assertEquals(123456789012345L,request.path("orderCode").asLong());
   assertEquals("http://localhost:4176/tai-khoan/hoa-don?payment="+intent+"&clinicId="+clinic+"&branchId="+branch,request.path("returnUrl").asText());
   assertEquals(request.path("returnUrl"),request.path("cancelUrl"));
   // Independently calculated protocol vector, rather than the production signer.
   assertEquals("6fe4ece6a54fc051bf7ebec3b96cbe059f3b5781915778906b378be277bbe5ef",request.path("signature").asText());
  }finally{server.stop(0);}
 }
 @Test void vnpayRequiresSuccessStatusMerchantAndWholeVnd(){
  var gateway=gateway();var params=new HashMap<String,String>(Map.of("vnp_TmnCode","TMNTEST1","vnp_Amount","10000000","vnp_TxnRef","ref","vnp_TransactionNo","transaction1","vnp_ResponseCode","00","vnp_TransactionStatus","00"));sign(params);assertTrue(gateway.vnpay(params).paid());
  params.put("vnp_TransactionStatus","02");sign(params);assertFalse(gateway.vnpay(params).paid());params.put("vnp_Amount","10000001");sign(params);assertThrows(ApiProblem.class,()->gateway.vnpay(params));params.put("vnp_TmnCode","OTHER123");sign(params);assertFalse(gateway.validVnpay(params));
 }
 private void sign(Map<String,String> data){data.remove("vnp_SecureHash");data.put("vnp_SecureHash",PaymentGateways.hmac("HmacSHA512","synthetic-vnpay-key",PaymentGateways.query(data)));}
 @Test void qrContainsExactInvoiceAmountAndOnlyAdministrativeReference(){var bank=gateway().bank(clinic,UUID.fromString("fedcba98-1234-4567-89ab-123456789012"),180000);assertEquals(180000,bank.amountVnd());assertTrue(bank.qrUrl().contains("amount=180000"));assertEquals("PKFEDCBA981234456789AB",bank.content());assertTrue(bank.qrUrl().contains("NGUYEN+VAN+A"));assertFalse(bank.qrUrl().contains("patient"));}
}
